import { Hex } from "viem";

const BASE_URL = "https://api.0x.org";

export type Quote = {
  buyAmount: bigint;
  sellAmount: bigint;
  to: `0x${string}`;
  data: Hex;
  value?: bigint;
  allowanceTarget?: `0x${string}`;
};

export async function quote0x(params: {
  chainId: number;
  sellToken: `0x${string}`;
  buyToken: `0x${string}`;
  sellAmount: bigint;
  takerAddress?: `0x${string}`;
  slippageBps?: number;
}): Promise<Quote> {
  const url = new URL(`${BASE_URL}/swap/v1/quote`);
  url.searchParams.set("chainId", String(params.chainId));
  url.searchParams.set("sellToken", params.sellToken);
  url.searchParams.set("buyToken", params.buyToken);
  url.searchParams.set("sellAmount", params.sellAmount.toString());
  if (params.takerAddress) url.searchParams.set("takerAddress", params.takerAddress);
  if (params.slippageBps != null) url.searchParams.set("slippagePercentage", String(params.slippageBps / 10000));

  const headers: Record<string, string> = {};
  if (process.env.ZEROX_API_KEY) headers["0x-api-key"] = process.env.ZEROX_API_KEY;

  const res = await fetch(url.toString(), { headers });
  if (!res.ok) throw new Error(`0x quote failed: ${res.status} ${await res.text()}`);
  const j = await res.json();

  return {
    buyAmount: BigInt(j.buyAmount),
    sellAmount: BigInt(j.sellAmount),
    to: j.to,
    data: j.data,
    value: j.value ? BigInt(j.value) : 0n,
    allowanceTarget: j.allowanceTarget
  };
}
