import { apiMultipartRequest, apiRequest, seedTestTenants } from "../fixtures/seed.js";

type TestResult = { name: string; passed: boolean; detail?: string };
const results: TestResult[] = [];

function pass(name: string, detail?: string) {
  results.push({ name, passed: true, detail });
  console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name: string, detail?: string) {
  results.push({ name, passed: false, detail });
  console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function run() {
  const tenants = await seedTestTenants();
  const adminToken = tenants.tenantA.adminToken;
  const contributorToken = tenants.tenantA.contributorToken;

  const buildPolicyForm = (overrides?: {
    title?: string;
    documentLink?: string;
    file?: Blob;
    filename?: string;
    removeAttachment?: boolean;
  }) => {
    const form = new FormData();
    form.append("title", overrides?.title ?? `QA Policy ${Date.now()}`);
    form.append("policyType", "other");
    form.append("owner", "");
    form.append("status", "draft");
    form.append("effectiveDate", "");
    form.append("reviewDate", "");
    form.append("documentLink", overrides?.documentLink ?? "");
    form.append("notes", "");
    if (overrides?.file) {
      form.append("attachment", overrides.file, overrides.filename ?? "policy.pdf");
    }
    if (overrides?.removeAttachment) {
      form.append("removeAttachment", "true");
    }
    return form;
  };

  {
    const name = "Admin can create a policy record when optional fields are blank";
    const res = await apiRequest("POST", "/api/policy-records", {
      title: `QA Policy ${Date.now()}`,
      policyType: "other",
      owner: "",
      status: "draft",
      effectiveDate: "",
      reviewDate: "",
      documentLink: "",
      notes: "",
    }, adminToken);

    if (![200, 201].includes(res.status)) {
      fail(name, `status=${res.status} body=${res.body.slice(0, 200)}`);
    } else {
      const body = JSON.parse(res.body) as {
        title?: string;
        effectiveDate?: string | null;
        reviewDate?: string | null;
        documentLink?: string | null;
        notes?: string | null;
      };
      if (body.effectiveDate !== null || body.reviewDate !== null || body.documentLink !== null || body.notes !== null) {
        fail(name, `expected blank optional fields to normalize to null, got ${res.body.slice(0, 200)}`);
      } else if (!body.title) {
        fail(name, "missing created title");
      } else {
        pass(name, body.title);
      }
    }
  }

  {
    const name = "Admin can create a policy record with link only";
    const res = await apiRequest("POST", "/api/policy-records", {
      title: `Link Only Policy ${Date.now()}`,
      policyType: "other",
      owner: "",
      status: "draft",
      effectiveDate: "",
      reviewDate: "",
      documentLink: "https://example.com/policies/link-only.pdf",
      notes: "",
    }, adminToken);

    if (![200, 201].includes(res.status)) {
      fail(name, `status=${res.status} body=${res.body.slice(0, 200)}`);
    } else {
      const body = JSON.parse(res.body) as { documentLink?: string | null; attachment?: unknown };
      if (body.documentLink !== "https://example.com/policies/link-only.pdf" || body.attachment !== null) {
        fail(name, `unexpected response ${res.body.slice(0, 200)}`);
      } else {
        pass(name);
      }
    }
  }

  let uploadOnlyPolicyId = "";
  {
    const name = "Admin can create a policy record with upload only";
    const res = await apiMultipartRequest(
      "POST",
      "/api/policy-records",
      buildPolicyForm({
        title: `Upload Only Policy ${Date.now()}`,
        file: new Blob(["policy body"], { type: "application/pdf" }),
        filename: "upload-only-policy.pdf",
      }),
      adminToken,
    );

    if (![200, 201].includes(res.status)) {
      fail(name, `status=${res.status} body=${res.body.slice(0, 200)}`);
    } else {
      const body = JSON.parse(res.body) as {
        id?: string;
        documentLink?: string | null;
        attachment?: { fileName?: string; downloadUrl?: string };
      };
      uploadOnlyPolicyId = body.id || "";
      if (!uploadOnlyPolicyId || body.documentLink !== null || body.attachment?.fileName !== "upload-only-policy.pdf" || !body.attachment?.downloadUrl) {
        fail(name, `unexpected response ${res.body.slice(0, 200)}`);
      } else {
        pass(name, body.attachment.fileName);
      }
    }
  }

  let bothPolicyId = "";
  {
    const name = "Admin can create a policy record with both link and upload";
    const res = await apiMultipartRequest(
      "POST",
      "/api/policy-records",
      buildPolicyForm({
        title: `Both Policy ${Date.now()}`,
        documentLink: "https://example.com/policies/both.pdf",
        file: new Blob(["policy body"], { type: "application/pdf" }),
        filename: "both-policy.pdf",
      }),
      adminToken,
    );

    if (![200, 201].includes(res.status)) {
      fail(name, `status=${res.status} body=${res.body.slice(0, 200)}`);
    } else {
      const body = JSON.parse(res.body) as {
        id?: string;
        documentLink?: string | null;
        attachment?: { fileName?: string };
      };
      bothPolicyId = body.id || "";
      if (!bothPolicyId || body.documentLink !== "https://example.com/policies/both.pdf" || body.attachment?.fileName !== "both-policy.pdf") {
        fail(name, `unexpected response ${res.body.slice(0, 200)}`);
      } else {
        pass(name);
      }
    }
  }

  {
    const name = "Admin can replace a policy attachment";
    const res = await apiMultipartRequest(
      "PATCH",
      `/api/policy-records/${bothPolicyId}`,
      buildPolicyForm({
        title: `Both Policy Replaced ${Date.now()}`,
        documentLink: "https://example.com/policies/both.pdf",
        file: new Blob(["replacement"], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }),
        filename: "replacement-policy.docx",
      }),
      adminToken,
    );

    if (res.status !== 200) {
      fail(name, `status=${res.status} body=${res.body.slice(0, 200)}`);
    } else {
      const body = JSON.parse(res.body) as { attachment?: { fileName?: string; mimeType?: string } };
      if (body.attachment?.fileName !== "replacement-policy.docx") {
        fail(name, `unexpected response ${res.body.slice(0, 200)}`);
      } else {
        pass(name, body.attachment.fileName);
      }
    }
  }

  {
    const name = "Admin can delete a policy attachment without deleting the policy";
    const deleteRes = await apiRequest("DELETE", `/api/policy-records/${bothPolicyId}/attachment`, undefined, adminToken);
    const listRes = await apiRequest("GET", "/api/policy-records", undefined, adminToken);
    if (deleteRes.status !== 200 || listRes.status !== 200) {
      fail(name, `delete=${deleteRes.status} list=${listRes.status}`);
    } else {
      const policies = JSON.parse(listRes.body) as Array<{ id: string; attachment?: unknown }>;
      const updated = policies.find((policy) => policy.id === bothPolicyId);
      if (!updated || updated.attachment !== null) {
        fail(name, `attachment still present after delete: ${listRes.body.slice(0, 200)}`);
      } else {
        pass(name);
      }
    }
  }

  {
    const name = "Unauthorized upload attempt is rejected";
    const res = await apiMultipartRequest(
      "POST",
      "/api/policy-records",
      buildPolicyForm({
        title: `Unauthorized Policy ${Date.now()}`,
        file: new Blob(["policy body"], { type: "application/pdf" }),
        filename: "unauthorized-policy.pdf",
      }),
      contributorToken,
    );

    if (res.status !== 403) {
      fail(name, `expected 403, got ${res.status} body=${res.body.slice(0, 200)}`);
    } else {
      pass(name);
    }
  }

  {
    const name = "Invalid file type is rejected server-side";
    const res = await apiMultipartRequest(
      "POST",
      "/api/policy-records",
      buildPolicyForm({
        title: `Invalid Type Policy ${Date.now()}`,
        file: new Blob(["not allowed"], { type: "text/plain" }),
        filename: "invalid-type.txt",
      }),
      adminToken,
    );

    if (res.status !== 400 || !res.body.includes("Only PDF, DOC, and DOCX")) {
      fail(name, `unexpected status/body ${res.status} ${res.body.slice(0, 200)}`);
    } else {
      pass(name);
    }
  }

  {
    const name = "Oversized policy attachment is rejected";
    const oversizedBytes = new Uint8Array(10 * 1024 * 1024 + 1);
    const res = await apiMultipartRequest(
      "POST",
      "/api/policy-records",
      buildPolicyForm({
        title: `Oversized Policy ${Date.now()}`,
        file: new Blob([oversizedBytes], { type: "application/pdf" }),
        filename: "oversized-policy.pdf",
      }),
      adminToken,
    );

    if (res.status !== 400 || !res.body.includes("size limit")) {
      fail(name, `unexpected status/body ${res.status} ${res.body.slice(0, 200)}`);
    } else {
      pass(name);
    }
  }
}

(async () => {
  console.log("\n=== API Tests: Policy Records ===\n");
  try {
    await run();
  } catch (error) {
    console.error("TEST FAILED:", error);
    process.exit(1);
  }

  const passed = results.filter((result) => result.passed).length;
  const total = results.length;
  console.log(`\n=== Policy records: ${passed}/${total} passed ===\n`);
  if (passed < total) process.exit(1);
})();
