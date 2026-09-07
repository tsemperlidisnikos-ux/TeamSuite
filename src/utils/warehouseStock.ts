import type { WarehouseProduct } from '../types';

export function minStockOf(product: Pick<WarehouseProduct, 'minStock'>): number {
  return product.minStock ?? 5;
}

export function isLowStock(product: Pick<WarehouseProduct, 'stockQty' | 'minStock'>): boolean {
  return (product.stockQty ?? 0) <= minStockOf(product);
}

export function listLowStockProducts(products: WarehouseProduct[] | undefined): WarehouseProduct[] {
  return (products ?? [])
    .filter(isLowStock)
    .sort((a, b) => a.name.localeCompare(b.name, 'el'));
}
