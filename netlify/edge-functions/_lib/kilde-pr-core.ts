// GitHub-kjernen for /api/kilde-pr (spec 2026-08-13-kildeforbedring §9):
// branch + commit + PR i fire REST-kall, injisert fetch (deno-testbar,
// samme seam-mønster som hent-core.ts). Aldri merge — kun PR.

export interface PrMaal { path: string; create: boolean; }

export function slugify(s: string): string {
  return String(s ?? "").toLowerCase()
    .replace(/æ/g, "ae").replace(/[åä]/g, "a").replace(/[øö]/g, "o")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, 60) || "kilde";
}

// Kopi av innebygd (of) → oppdater fasitfila; ren egen kilde → ny
// community-pakke. GitHubs contents-API skiller de to kun ved sha (spec §9).
export function velgMaal(inn: { of?: string; id: string; name: string }): PrMaal {
  if (inn.of) return { path: `data/sources/${inn.of}.md`, create: false };
  return { path: `data/packs/community/${slugify(inn.name || inn.id)}.md`, create: true };
}

export function byggBranchNavn(path: string, dato: Date): string {
  const base = path.split("/").pop()!.replace(/\.md$/, "");
  const d = dato.toISOString().slice(0, 19).replace(/[-:T]/g, "");
  return `kilde/${slugify(base)}-${d}`;
}

// btoa tar latin1 — UTF-8-bytes chunkes for å unngå call-stack-taket på
// String.fromCharCode ved store dokumenter.
export function base64Utf8(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

export interface PrDeps { fetchImpl: typeof fetch; token: string; repo: string; }
export interface PrInn {
  path: string; create: boolean; innhold: string;
  tittel: string; kropp: string; branch: string;
}

export async function opprettPr(deps: PrDeps, inn: PrInn): Promise<{ url: string }> {
  const gh = (sti: string, init?: RequestInit) =>
    deps.fetchImpl(`https://api.github.com/repos/${deps.repo}${sti}`, {
      ...init,
      headers: {
        "Authorization": `Bearer ${deps.token}`,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "askstat-kilde-pr",
        ...(init?.headers ?? {}),
      },
    });

  const refRes = await gh(`/git/ref/heads/main`);
  if (!refRes.ok) throw new Error(`GitHub ref: ${refRes.status}`);
  const sha = ((await refRes.json()) as { object: { sha: string } }).object.sha;

  const brRes = await gh(`/git/refs`, {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${inn.branch}`, sha }),
  });
  // 422 = branchen finnes fra før — trygt å gjenbruke: PUT under skriver
  // samme filsti, og PR-en peker uansett på branch-hodet.
  if (!brRes.ok && brRes.status !== 422) throw new Error(`GitHub branch: ${brRes.status}`);
  await brRes.body?.cancel();

  let filSha: string | undefined;
  if (!inn.create) {
    const fRes = await gh(`/contents/${inn.path}?ref=main`);
    if (fRes.ok) filSha = ((await fRes.json()) as { sha: string }).sha;
    else await fRes.body?.cancel();
  }

  const putRes = await gh(`/contents/${inn.path}`, {
    method: "PUT",
    body: JSON.stringify({
      message: inn.tittel,
      content: base64Utf8(inn.innhold),
      branch: inn.branch,
      ...(filSha ? { sha: filSha } : {}),
    }),
  });
  if (!putRes.ok) throw new Error(`GitHub contents: ${putRes.status}`);
  await putRes.body?.cancel();

  const prRes = await gh(`/pulls`, {
    method: "POST",
    body: JSON.stringify({ title: inn.tittel, head: inn.branch, base: "main", body: inn.kropp }),
  });
  if (!prRes.ok) throw new Error(`GitHub PR: ${prRes.status}`);
  return { url: ((await prRes.json()) as { html_url: string }).html_url };
}
