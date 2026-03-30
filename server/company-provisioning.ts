import { db, storage } from "./storage";
import { companies, groupCompanies, userGroupRoles, users, roleEnum } from "@shared/schema";
import { eq, and, ilike } from "drizzle-orm";
import { z } from "zod";

type UserRole = typeof roleEnum.enumValues[number];

export const VALID_SECTORS = [
  "agriculture", "construction", "education", "energy", "finance",
  "food_beverage", "healthcare", "hospitality", "manufacturing",
  "professional_services", "property_real_estate", "retail",
  "technology", "transport_logistics", "waste_management", "other",
];

export const VALID_COUNTRIES = [
  "AF","AX","AL","DZ","AS","AD","AO","AI","AQ","AG","AR","AM","AW","AU","AT","AZ",
  "BS","BH","BD","BB","BY","BE","BZ","BJ","BM","BT","BO","BQ","BA","BW","BV","BR",
  "IO","BN","BG","BF","BI","CV","KH","CM","CA","KY","CF","TD","CL","CN","CX","CC",
  "CO","KM","CG","CD","CK","CR","CI","HR","CU","CW","CY","CZ","DK","DJ","DM","DO",
  "EC","EG","SV","GQ","ER","EE","SZ","ET","FK","FO","FJ","FI","FR","GF","PF","TF",
  "GA","GM","GE","DE","GH","GI","GR","GL","GD","GP","GU","GT","GG","GN","GW","GY",
  "HT","HM","VA","HN","HK","HU","IS","IN","ID","IR","IQ","IE","IM","IL","IT","JM",
  "JP","JE","JO","KZ","KE","KI","KP","KR","KW","KG","LA","LV","LB","LS","LR","LY",
  "LI","LT","LU","MO","MG","MW","MY","MV","ML","MT","MH","MQ","MR","MU","YT","MX",
  "FM","MD","MC","MN","ME","MS","MA","MZ","MM","NA","NR","NP","NL","NC","NZ","NI",
  "NE","NG","NU","NF","MK","MP","NO","OM","PK","PW","PS","PA","PG","PY","PE","PH",
  "PN","PL","PT","PR","QA","RE","RO","RU","RW","BL","SH","KN","LC","MF","PM","VC",
  "WS","SM","ST","SA","SN","RS","SC","SL","SG","SX","SK","SI","SB","SO","ZA","GS",
  "SS","ES","LK","SD","SR","SJ","SE","CH","SY","TW","TJ","TZ","TH","TL","TG","TK",
  "TO","TT","TN","TR","TM","TC","TV","UG","UA","AE","GB","US","UM","UY","UZ","VU",
  "VE","VN","VG","VI","WF","EH","YE","ZM","ZW",
];

// Roles permitted to create a company (checked inside the service itself — not only at route level)
const CREATOR_ALLOWED_ROLES = ["admin", "super_admin", "portfolio_owner"] as const;

export const provisionCompanyInputSchema = z.object({
  companyName: z.string().min(1, "Company name is required").max(200),
  sector: z.string().optional(),
  country: z.string().optional(),
  companySizeBand: z.string().optional(),
  reportingYear: z.number().int().optional(),
  creatorUserId: z.string().min(1, "Creator user ID is required"),
  groupId: z.string().optional(),
  initialUsers: z.array(z.object({
    userId: z.string(),
    role: z.string(),
  })).optional(),
  skipDuplicateNameCheck: z.boolean().optional(),
  // Internal flag: skip creator permission check (used during registration where the user
  // is being created fresh and doesn't yet have a role in the DB)
  skipCreatorPermissionCheck: z.boolean().optional(),
});

export type ProvisionCompanyInput = z.infer<typeof provisionCompanyInputSchema>;

export interface ProvisionCompanyResult {
  companyId: string;
  lifecycleState: string;
  landingContext: "company" | "onboarding";
}

interface UserRollbackState {
  companyId: string | null;
  role: UserRole;
}

/**
 * Clean rollback of a partially provisioned company.
 * Unlike deleteCompanyData (which anonymizes users), this:
 *  - Restores each user's original companyId AND role (not just companyId)
 *  - Removes group-company links
 *  - Hard-deletes the company row (it has no real data yet)
 *
 * Safe because the company was just created and has no production data.
 */
async function rollbackProvisionedCompany(
  companyId: string | null,
  assignedUserIds: string[],
  userRollbackStates: Map<string, UserRollbackState>,
): Promise<void> {
  // Revert user assignments: restore both companyId AND role
  for (const userId of assignedUserIds) {
    const rollbackState = userRollbackStates.get(userId);
    if (!rollbackState) continue;
    try {
      await db.update(users)
        .set({
          companyId: rollbackState.companyId,
          role: rollbackState.role,
        })
        .where(eq(users.id, userId));
    } catch (e) {
      console.error(`[provisionCompany] Rollback: failed to revert user ${userId}:`, e);
    }
  }
  if (companyId) {
    // Remove group links
    try {
      await db.delete(groupCompanies).where(eq(groupCompanies.companyId, companyId));
    } catch (e) {
      console.error(`[provisionCompany] Rollback: failed to remove group links for ${companyId}:`, e);
    }
    // Hard-delete the company (no real data exists yet)
    try {
      await db.delete(companies).where(eq(companies.id, companyId));
    } catch (e) {
      console.error(`[provisionCompany] Rollback: failed to delete company ${companyId}:`, e);
    }
  }
}

export async function provisionCompany(input: ProvisionCompanyInput): Promise<ProvisionCompanyResult> {
  const parsed = provisionCompanyInputSchema.parse(input);

  const { companyName, sector, country, companySizeBand, reportingYear, creatorUserId, groupId, initialUsers } = parsed;

  if (sector && !VALID_SECTORS.includes(sector)) {
    throw new Error(`Invalid sector: ${sector}`);
  }
  if (country && !VALID_COUNTRIES.includes(country)) {
    throw new Error(`Invalid country code: ${country}`);
  }

  const creatorUser = await storage.getUser(creatorUserId);
  if (!creatorUser) {
    throw new Error("Creator user not found");
  }

  // Explicit creator permission check (enforced in the service, not only at the route level)
  // skipCreatorPermissionCheck is only used during registration (user has no role yet)
  if (!parsed.skipCreatorPermissionCheck) {
    if (!(CREATOR_ALLOWED_ROLES as readonly string[]).includes(creatorUser.role)) {
      throw new Error("Insufficient permissions: only admins, super admins, and portfolio owners can create companies");
    }
  }

  if (!parsed.skipDuplicateNameCheck) {
    const existingByName = await db
      .select({ id: companies.id, name: companies.name })
      .from(companies)
      .where(ilike(companies.name, companyName.trim()));
    if (existingByName.length > 0) {
      throw new Error(`A company with the name "${companyName}" already exists`);
    }
  }

  if (groupId) {
    const group = await storage.getGroupById(groupId);
    if (!group) {
      throw new Error(`Group ${groupId} not found`);
    }
    const userGroupRole = await db
      .select()
      .from(userGroupRoles)
      .where(and(eq(userGroupRoles.userId, creatorUserId), eq(userGroupRoles.groupId, groupId)));
    if (
      userGroupRole.length === 0 &&
      creatorUser.role !== "super_admin"
    ) {
      throw new Error("You do not have permission to create companies in this group");
    }
    if (
      userGroupRole.length > 0 &&
      userGroupRole[0].role !== "portfolio_owner" &&
      creatorUser.role !== "super_admin"
    ) {
      throw new Error("Only portfolio owners can create companies in a group");
    }
  }

  // Pre-fetch initial user records to capture original state before the transaction modifies them
  const initialUserRecords = new Map<string, { companyId: string | null; role: UserRole }>();
  if (initialUsers && initialUsers.length > 0) {
    for (const iu of initialUsers) {
      const iuUser = await storage.getUser(iu.userId);
      if (iuUser) {
        initialUserRecords.set(iu.userId, { companyId: iuUser.companyId ?? null, role: iuUser.role });
      }
    }
  }

  // Execute all provisioning steps inside a DB transaction for atomicity.
  // If any step fails, the transaction auto-rolls back — no partial writes possible.
  // createdCompanyId is captured outside the transaction so the defensive fallback rollback
  // can delete the company row if the transaction commit fails after data was written.
  let createdCompanyId: string | null = null;
  const assignedUserIds: string[] = [];
  const userRollbackStates = new Map<string, UserRollbackState>();

  try {
    const result = await db.transaction(async (tx) => {
      // Create company
      const [company] = await tx.insert(companies).values({
        name: companyName.trim(),
        industry: sector || null,
        country: country || null,
        businessType: companySizeBand || null,
        reportingYearStart: reportingYear ? String(reportingYear) : null,
        lifecycleState: "created",
      }).returning();

      // Capture companyId outside the transaction scope for defensive fallback rollback
      createdCompanyId = company.id;

      // Assign creator as admin of the new company per provisioning contract.
      // Exception: super_admin is a system-wide role and must not be overwritten;
      // super_admins are implicitly authorized over all companies and keep their global role.
      // portfolio_owner and all other roles (including existing admin) are promoted to admin.
      const creatorRoleAfter: UserRole = creatorUser.role === "super_admin"
        ? "super_admin"
        : "admin";
      userRollbackStates.set(creatorUserId, { companyId: creatorUser.companyId ?? null, role: creatorUser.role });
      await tx.update(users)
        .set({ companyId: company.id, role: creatorRoleAfter })
        .where(eq(users.id, creatorUserId));
      assignedUserIds.push(creatorUserId);

      // Attach to group if specified
      if (groupId) {
        await tx.insert(groupCompanies).values({ groupId, companyId: company.id });
      }

      // Assign initial users if specified
      if (initialUsers && initialUsers.length > 0) {
        for (const iu of initialUsers) {
          if (initialUserRecords.has(iu.userId)) {
            const orig = initialUserRecords.get(iu.userId)!;
            userRollbackStates.set(iu.userId, orig);
            await tx.update(users)
              .set({
                companyId: company.id,
                role: iu.role as "admin" | "editor" | "contributor" | "approver" | "viewer",
              })
              .where(eq(users.id, iu.userId));
            assignedUserIds.push(iu.userId);
          }
        }
      }

      return company;
    });

    return {
      companyId: result.id,
      lifecycleState: "created",
      landingContext: "onboarding",
    };
  } catch (err) {
    // Transaction auto-rolled back; defensive explicit rollback in case of partial state.
    // createdCompanyId is set as soon as the company row is inserted, so it is available
    // here if the transaction commit fails after the insert.
    await rollbackProvisionedCompany(createdCompanyId, assignedUserIds, userRollbackStates);
    throw err;
  }
}
