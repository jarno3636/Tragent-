import type { Hex } from "viem";

export type ZeroXQuote = {
  buyAmount: bigint;
  sellAmount: bigint;
  to: `0x${string}`;
  data: Hex;
  value: bigint;
  allowanceTarget?: `0x${string}`;
};

export async function quote0x(params: {
  chainId: number;
  sellToken: `0x${string}`;
  buyToken: `0x${string}`;
  sellAmount: bigint;
  takerAddress: `0x${string}`;
  slippageBps: number;
}): Promise<ZeroXQuote> {
  const url = new URL("https://api.0x.org/swap/v1/quote");
  url.searchParams.set("chainId", String(params.chainId));
  url.searchParams.set("sellToken", params.sellToken);
  url.searchParams.set("buyToken", params.buyToken);
  url.searchParams.set("sellAmount", params.sellAmount.toString());
  url.searchParams.set("takerAddress", params.takerAddress);
  url.searchParams.set("slippagePercentage", String(params.slippageBps / 10000));

  const headers: Record<string, string> = { "accept": "application/json" };
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
