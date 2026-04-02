import { z } from "zod";

export const wsMessageSchema = z
  .object({
    type: z.string(),
    data: z.string().optional(),
    subType: z.string().optional(),
  })
  .passthrough();

export const announcementDataSchema = z
  .object({
    catalogId: z.number(),
    catalogName: z.string(),
    publishDate: z.number(),
    title: z.string(),
    body: z.string(),
    code: z.string().optional(),
  })
  .passthrough();

export const bapiResponseSchema = z.object({
  code: z.string(),
  success: z.boolean(),
  data: z.object({
    articles: z.array(
      z
        .object({
          id: z.number(),
          code: z.string(),
          title: z.string(),
        })
        .passthrough(),
    ),
    total: z.number(),
  }),
});

export const alphaApiResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(
    z
      .object({
        alphaId: z.string(),
        tokenId: z.string(),
        symbol: z.string(),
        name: z.string(),
        chainId: z.string(),
        contractAddress: z.string(),
        listingTime: z.number(),
        onlineAirdrop: z.boolean(),
        onlineTge: z.boolean(),
        price: z.string(),
        marketCap: z.string(),
        volume24h: z.string(),
      })
      .passthrough(),
  ),
});
