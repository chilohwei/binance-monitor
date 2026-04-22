export interface AnnouncementFilterOptions {
  catalogIds: ReadonlyArray<number>;
  keywords: ReadonlyArray<string>;
}

export interface AnnouncementFilterInput {
  catalogId: number;
  title: string;
  body?: string;
}

export function matchesAnnouncementFilter(
  input: AnnouncementFilterInput,
  options: AnnouncementFilterOptions,
): boolean {
  if (!options.catalogIds.includes(input.catalogId)) {
    return false;
  }

  return matchesAnnouncementKeywords(
    { title: input.title, body: input.body },
    options.keywords,
  );
}

export function matchesAnnouncementKeywords(
  input: Pick<AnnouncementFilterInput, "title" | "body">,
  keywords: ReadonlyArray<string>,
): boolean {
  if (keywords.length === 0) {
    return true;
  }

  return keywords.some(
    (keyword) =>
      input.title.includes(keyword) || Boolean(input.body?.includes(keyword)),
  );
}
