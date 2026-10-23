import { storage } from "@/src/utils/storage";

export type DownloadedPaperDraft = {
  paper_id: string;
  title: string;
  pdf_url: string;
  subject?: string;
  level?: string;
  year?: number;
  paper_number?: number;
  saved_at: string;
  downloaded_offline: true;
};

function draftsKey(userId: string): string {
  return `gcsharp_downloaded_paper_drafts_${userId}`;
}

function removedDraftsKey(userId: string): string {
  return `gcsharp_removed_downloaded_paper_drafts_${userId}`;
}

export async function getDownloadedPaperDrafts(
  userId: string,
): Promise<DownloadedPaperDraft[]> {
  return (await storage.getItem<DownloadedPaperDraft[]>(draftsKey(userId), [])) || [];
}

export async function getRemovedDownloadedPaperDraftIds(
  userId: string,
): Promise<string[]> {
  return (await storage.getItem<string[]>(removedDraftsKey(userId), [])) || [];
}

export async function saveDownloadedPaperDraft(
  userId: string,
  paper: Omit<DownloadedPaperDraft, "saved_at" | "downloaded_offline">,
): Promise<DownloadedPaperDraft[]> {
  const drafts = await getDownloadedPaperDrafts(userId);
  const saved: DownloadedPaperDraft = {
    ...paper,
    saved_at: new Date().toISOString(),
    downloaded_offline: true,
  };
  const next = [saved, ...drafts.filter((draft) => draft.paper_id !== paper.paper_id)];
  const persisted = await storage.setItem(draftsKey(userId), next);
  if (!persisted) {
    throw new Error("Could not save the downloaded paper to this phone's drafts.");
  }
  const removedIds = await getRemovedDownloadedPaperDraftIds(userId);
  const nextRemovedIds = removedIds.filter(
    (id) => id !== paper.paper_id && id !== paper.pdf_url,
  );
  if (nextRemovedIds.length !== removedIds.length) {
    const savedRemovedIds = await storage.setItem(
      removedDraftsKey(userId),
      nextRemovedIds,
    );
    if (!savedRemovedIds) {
      throw new Error("Could not update this phone's downloaded draft list.");
    }
  }
  return next;
}

export async function removeDownloadedPaperDraft(
  userId: string,
  paperId: string,
  pdfUrl?: string,
): Promise<DownloadedPaperDraft[]> {
  const drafts = await getDownloadedPaperDrafts(userId);
  const removedDraft = drafts.find((draft) => draft.paper_id === paperId);
  const next = drafts.filter((draft) => draft.paper_id !== paperId);
  const persisted = await storage.setItem(draftsKey(userId), next);
  if (!persisted) {
    throw new Error("Could not remove the downloaded paper from this phone's drafts.");
  }
  const removedIds = await getRemovedDownloadedPaperDraftIds(userId);
  const removedValues = [
    paperId,
    ...(removedDraft ? [removedDraft.pdf_url] : []),
    ...(pdfUrl ? [pdfUrl] : []),
  ];
  if (removedValues.some((value) => !removedIds.includes(value))) {
    const savedRemovedIds = await storage.setItem(
      removedDraftsKey(userId),
      [...new Set([...removedIds, ...removedValues])],
    );
    if (!savedRemovedIds) {
      throw new Error("Could not update this phone's downloaded draft list.");
    }
  }
  return next;
}

export async function mergeDownloadedPapersIntoDrafts(
  userId: string,
  papers: DownloadedPaperDraft[],
): Promise<DownloadedPaperDraft[]> {
  const removedIds = new Set(await getRemovedDownloadedPaperDraftIds(userId));
  const existing = await getDownloadedPaperDrafts(userId);
  const merged = new Map(existing.map((draft) => [draft.paper_id, draft]));
  for (const paper of papers) {
    if (removedIds.has(paper.paper_id) || removedIds.has(paper.pdf_url)) continue;
    const duplicate = [...merged.values()].find((draft) => draft.pdf_url === paper.pdf_url);
    if (duplicate && !duplicate.paper_id.startsWith("cached_pdf_")) continue;
    if (duplicate) merged.delete(duplicate.paper_id);
    merged.set(paper.paper_id, paper);
  }
  const next = [...merged.values()].sort(
    (a, b) => Date.parse(b.saved_at) - Date.parse(a.saved_at),
  );
  const persisted = await storage.setItem(draftsKey(userId), next);
  if (!persisted) {
    throw new Error("Could not add your downloaded papers to My Drafts.");
  }
  return next;
}
