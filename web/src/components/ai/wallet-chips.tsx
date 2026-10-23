"use client";

import { Coins, Trophy } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useWallet } from "@/lib/wallet-queries";

/** Points and credits in the header. */
export function WalletChips() {
  const w = useWallet();
  if (!w.data) return null;
  const { points, credits } = w.data;
  return (
    <div className="flex items-center gap-1.5" data-testid="wallet-chips">
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="bg-muted inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium tabular-nums" aria-label={`${points.total} points`}>
            <Trophy className="text-warning size-3.5" aria-hidden /> {points.total}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {points.finished} tasks finished, {points.on_time} on time
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="bg-muted inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium tabular-nums" aria-label={`${credits.balance} credits`}>
            <Coins className="text-primary size-3.5" aria-hidden /> {credits.balance}
          </span>
        </TooltipTrigger>
        <TooltipContent>Credits pay for AI helper questions. Finish tasks to earn more.</TooltipContent>
      </Tooltip>
    </div>
  );
}
