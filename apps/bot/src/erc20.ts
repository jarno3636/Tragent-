import { PublicClient } from "viem";

export const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }]
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }]
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" }
    ],
    outputs: [{ type: "uint256" }]
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ type: "bool" }]
  }
] as const;

export async function decimals(client: PublicClient, token: `0x${string}`): Promise<number> {
  return client.readContract({ address: token, abi: ERC20_ABI, functionName: "decimals" }) as Promise<number>;
}

export async function balanceOf(
  client: PublicClient,
  token: `0x${string}`,
  owner: `0x${string}`
): Promise<bigint> {
  return client.readContract({
    address: token,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [owner]
  }) as Promise<bigint>;
}

export async function allowance(
  client: PublicClient,
  token: `0x${string}`,
  owner: `0x${string}`,
  spender: `0x${string}`
): Promise<bigint> {
  return client.readContract({
    address: token,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [owner, spender]
  }) as Promise<bigint>;
}
