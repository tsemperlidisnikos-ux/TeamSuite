import { apiClient } from '../apiClient';
import { settleVivaReturn } from '../../utils/vivaSettle';
import { listVivaPending } from '../../utils/vivaPending';

export async function pollVivaSettlements(clubId: string) {
  return apiClient(async () => {
    const response = await fetch('/api/viva/settlements');
    if (!response.ok) {
      if (response.status === 404) {
        return { applied: 0, messages: [] as string[] };
      }
      throw new Error(`Settlements HTTP ${response.status}`);
    }
    const payload = (await response.json()) as {
      ok?: boolean;
      settlements?: Array<{
        orderCode: string;
        transactionId: string;
        amountCents: number;
      }>;
    };
    const pending = listVivaPending().filter((p) => p.clubId === clubId);
    const pendingCodes = new Set(pending.map((p) => p.orderCode));
    const messages: string[] = [];
    let applied = 0;

    for (const item of payload.settlements ?? []) {
      if (!pendingCodes.has(item.orderCode) && pending.length === 0) continue;
      if (!pendingCodes.has(item.orderCode)) continue;

      const result = await settleVivaReturn({
        clubId,
        orderCode: item.orderCode,
        transactionId: item.transactionId,
      });
      if (result.settled) {
        applied += 1;
        messages.push(result.message);
        await fetch('/api/viva/settlements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderCode: item.orderCode }),
        });
      }
    }

    return { applied, messages };
  });
}
