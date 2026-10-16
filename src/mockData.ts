export type Status = 'Active' | 'Stale' | 'Outlier' | 'Disabled' | 'Running' | 'Success' | 'Failed' | 'Pending';
export interface Product { id: string; name: string; brand: string; category: string; offers: number; minPrice: number; status: Status; updated: string; }
export interface Offer { id: string; product: string; shop: string; price: number; finalPrice: number; availability: string; status: Status; updated: string; source: string; }
export interface Shop { name: string; type: string; products: number; offers: number; status: Status; lastSync: string; }

export const products: Product[] = [
  { id: 'P-1024', name: 'iPhone 15 128GB', brand: 'Apple', category: 'Điện thoại', offers: 8, minPrice: 18490000, status: 'Active', updated: '2 phút trước' },
  { id: 'P-1025', name: 'MacBook Air M3 13 inch', brand: 'Apple', category: 'Laptop', offers: 6, minPrice: 24990000, status: 'Active', updated: '5 phút trước' },
  { id: 'P-1026', name: 'Lenovo LOQ 15IRH11E', brand: 'Lenovo', category: 'Laptop', offers: 5, minPrice: 26990000, status: 'Stale', updated: '2 ngày trước' },
  { id: 'P-1027', name: 'Samsung Galaxy S24', brand: 'Samsung', category: 'Điện thoại', offers: 7, minPrice: 15990000, status: 'Active', updated: '12 phút trước' },
  { id: 'P-1028', name: 'AirPods Pro 2 USB-C', brand: 'Apple', category: 'Âm thanh', offers: 9, minPrice: 4990000, status: 'Outlier', updated: '18 phút trước' },
  { id: 'P-1029', name: 'ASUS Zenbook S 14', brand: 'ASUS', category: 'Laptop', offers: 4, minPrice: 46990000, status: 'Active', updated: '25 phút trước' },
];
export const offers: Offer[] = [
  { id: 'O-2001', product: 'iPhone 15 128GB', shop: 'Tiki', price: 18990000, finalPrice: 18490000, availability: 'Còn hàng', status: 'Active', updated: '2 phút trước', source: 'affiliate_feed' },
  { id: 'O-2002', product: 'iPhone 15 128GB', shop: 'Shopee Mall', price: 19290000, finalPrice: 18690000, availability: 'Còn hàng', status: 'Active', updated: '4 phút trước', source: 'api' },
  { id: 'O-2003', product: 'MacBook Air M3 13 inch', shop: 'CellphoneS', price: 25990000, finalPrice: 24990000, availability: 'Còn hàng', status: 'Active', updated: '5 phút trước', source: 'api' },
  { id: 'O-2004', product: 'Lenovo LOQ 15IRH11E', shop: 'TechMart', price: 29990000, finalPrice: 26990000, availability: 'Còn hàng', status: 'Stale', updated: '2 ngày trước', source: 'csv' },
  { id: 'O-2005', product: 'AirPods Pro 2 USB-C', shop: 'Daily Deal', price: 4590000, finalPrice: 3990000, availability: 'Còn hàng', status: 'Outlier', updated: '18 phút trước', source: 'affiliate_feed' },
];
export const shops: Shop[] = [
  { name: 'Tiki', type: 'Marketplace', products: 1240, offers: 2380, status: 'Active', lastSync: '2 phút trước' }, { name: 'Shopee Mall', type: 'Marketplace', products: 980, offers: 1840, status: 'Active', lastSync: '8 phút trước' }, { name: 'CellphoneS', type: 'Retailer', products: 420, offers: 610, status: 'Active', lastSync: '15 phút trước' }, { name: 'TechMart', type: 'Retailer', products: 315, offers: 450, status: 'Failed', lastSync: '3 giờ trước' },
];
export const matchingQueue = [
  { id: 'M-401', listing: 'MacBook Air M5 13 16GB 512GB', shop: 'CellphoneS', suggestion: 'MacBook Air M5 13 inch', confidence: 96, warning: '' },
  { id: 'M-402', listing: 'Laptop ASUS Vivobook 14 X1407', shop: 'Tiki', suggestion: 'ASUS Vivobook 14 X1407CA', confidence: 88, warning: 'Khác dung lượng SSD' },
  { id: 'M-403', listing: 'iPhone 15 256GB Blue', shop: 'Shopee Mall', suggestion: 'iPhone 15 128GB', confidence: 72, warning: 'Khác bộ nhớ' },
];
