import { apiClient } from '../apiClient';
import { getSession } from '../../auth/auth';
import { createId, mutateData } from '../../data/repository';
import { rememberDeletedId, rememberDeletedIds } from '../../data/financeSyncMerge';
import {
  stockMovementSchema,
  warehouseProductSchema,
  type StockMovementInput,
  type WarehouseProductInput,
} from '../../schemas';
import type { StockMovement, WarehouseProduct } from '../../types';
import { localDateTimeIso } from '../../utils/dates';
import { publishClubOpsSlice } from './clubOpsSyncService';

export async function createProduct(input: WarehouseProductInput) {
  return apiClient(() => {
    const parsed = warehouseProductSchema.parse(input);
    const product: WarehouseProduct = {
      ...parsed,
      stockQty: parsed.stockQty ?? 0,
      id: createId('product'),
      createdAt: localDateTimeIso(),
      updatedAt: Date.now(),
    };
    mutateData((data) => {
      if (!data.products) data.products = [];
      data.products.push(product);
    });
    void publishClubOpsSlice();
    return product;
  });
}

export async function updateProduct(id: string, input: WarehouseProductInput) {
  return apiClient(() => {
    const parsed = warehouseProductSchema.parse(input);
    let updated: WarehouseProduct | undefined;
    mutateData((data) => {
      if (!data.products) data.products = [];
      const index = data.products.findIndex((p) => p.id === id);
      if (index === -1) throw new Error('Το προϊόν δεν βρέθηκε');
      updated = {
        ...data.products[index],
        ...parsed,
        stockQty: parsed.stockQty ?? data.products[index].stockQty ?? 0,
        updatedAt: Date.now(),
      };
      data.products[index] = updated;
    });
    void publishClubOpsSlice();
    return updated!;
  });
}

export async function deleteProduct(id: string) {
  return apiClient(() => {
    mutateData((data) => {
      const removedStock = (data.stockMovements ?? [])
        .filter((m) => m.productId === id)
        .map((m) => m.id);
      data.products = (data.products ?? []).filter((p) => p.id !== id);
      data.stockMovements = (data.stockMovements ?? []).filter((m) => m.productId !== id);
      data.deletedProductIds = rememberDeletedId(data.deletedProductIds, id);
      data.deletedStockMovementIds = rememberDeletedIds(data.deletedStockMovementIds, removedStock);
    });
    void publishClubOpsSlice();
    return { id };
  });
}

export async function recordStockMovement(input: StockMovementInput) {
  return apiClient(() => {
    const parsed = stockMovementSchema.parse(input);
    const session = getSession();
    let movement: StockMovement | undefined;

    mutateData((data) => {
      if (!data.products) data.products = [];
      if (!data.stockMovements) data.stockMovements = [];
      const product = data.products.find((p) => p.id === parsed.productId);
      if (!product) throw new Error('Το προϊόν δεν βρέθηκε');

      const current = product.stockQty ?? 0;
      let next = current;
      if (parsed.type === 'in') next = current + parsed.quantity;
      else if (parsed.type === 'out') {
        if (parsed.quantity > current) {
          throw new Error(`Ανεπαρκές απόθεμα (διαθέσιμα ${current})`);
        }
        next = current - parsed.quantity;
      } else {
        next = parsed.quantity;
      }

      product.stockQty = next;
      movement = {
        id: createId('stock'),
        productId: product.id,
        type: parsed.type,
        quantity: parsed.quantity,
        note: parsed.note.trim(),
        createdAt: localDateTimeIso(),
        createdByName: session?.fullName || session?.email || 'Χρήστης',
        updatedAt: Date.now(),
      };
      data.stockMovements.unshift(movement);
    });
    void publishClubOpsSlice();
    return movement!;
  });
}
