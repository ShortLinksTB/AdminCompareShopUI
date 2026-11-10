import type { AdminRequest } from '../products/products-api';

export type ArticleStatus = 'Draft' | 'Published';
export type ArticleCategory = 'Kinh nghiệm mua sắm' | 'Đánh giá sản phẩm' | 'Xu hướng thị trường';
type ArticleCategoryWire = 'shopping-tips' | 'product-reviews' | 'market-trends';
export interface Article { id: number; title: string; slug: string; category: ArticleCategory; excerptText: string; contentMarkdown: string; coverFileId: string | null; tags: string | null; status: ArticleStatus; authorName: string; publishedAtUtc: string | null; createdAtUtc: string; updatedAtUtc: string; totalViews: number; }
export interface ArticlePage { items: Article[]; pageNumber: number; pageSize: number; totalItems: number; }
export interface ArticleInput { title: string; slug: string; category: ArticleCategory; excerptText: string; contentMarkdown: string; coverFileId: string | null; tags: string | null; }
interface ArticleWire extends Omit<Article, 'category' | 'tags'> { category: ArticleCategoryWire; tags: string[]; }
interface ArticlePageWire { items: ArticleWire[]; page: number; pageSize: number; totalItems: number; }
export interface DailyView { dateUtc: string; views: number; }
export interface ArticleAnalytics { dailyViews: DailyView[]; }
export class ArticlesApiError extends Error { constructor(message: string, readonly status: number) { super(message); this.name = 'ArticlesApiError'; } }
function apiErrorMessage(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const body = payload as Record<string, unknown>;
  if (body.errors && typeof body.errors === 'object') {
    const messages = Object.values(body.errors as Record<string, unknown>)
      .flatMap(value => Array.isArray(value) ? value : [value])
      .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()));
    if (messages.length) return messages.join(' ');
  }
  for (const key of ['detail', 'message', 'title']) {
    if (typeof body[key] === 'string' && body[key].trim()) return body[key].trim();
  }
  return undefined;
}
async function json<T>(request: AdminRequest, path: string, init?: RequestInit, action = 'load articles'): Promise<T> {
  const response = await request(path, init);
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new ArticlesApiError(`You do not have permission to ${action}.`, response.status);
    let detail: string | undefined;
    try { detail = apiErrorMessage(await response.clone().json()); } catch { /* The API may return an empty or non-JSON error body. */ }
    throw new ArticlesApiError(detail ?? `Could not ${action} (request failed with status ${response.status}).`, response.status);
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}
const CATEGORY_TO_WIRE: Record<ArticleCategory, ArticleCategoryWire> = { 'Kinh nghiệm mua sắm': 'shopping-tips', 'Đánh giá sản phẩm': 'product-reviews', 'Xu hướng thị trường': 'market-trends' };
const CATEGORY_FROM_WIRE: Record<ArticleCategoryWire, ArticleCategory> = { 'shopping-tips': 'Kinh nghiệm mua sắm', 'product-reviews': 'Đánh giá sản phẩm', 'market-trends': 'Xu hướng thị trường' };
function fromWire(article: ArticleWire): Article { return { ...article, category: CATEGORY_FROM_WIRE[article.category] ?? 'Kinh nghiệm mua sắm', tags: Array.isArray(article.tags) ? article.tags.join(', ') : '' }; }
function toWire(input: ArticleInput) { return { ...input, category: CATEGORY_TO_WIRE[input.category], tags: (input.tags ?? '').split(',').map(tag => tag.trim()).filter(Boolean) }; }
export async function getArticles(request: AdminRequest, query: {page:number;pageSize:number;q:string;category:string;status:string}, signal?:AbortSignal): Promise<ArticlePage> {
  const requestedPage = Number.isSafeInteger(query.page) && query.page > 0 ? query.page : 1;
  const params = new URLSearchParams({page:String(requestedPage),pageSize:String(query.pageSize)}); if(query.q.trim())params.set('q',query.q.trim());if(query.category!=='all')params.set('category',CATEGORY_TO_WIRE[query.category as ArticleCategory] ?? query.category);if(query.status!=='all')params.set('status',query.status);
  const result = await json<ArticlePageWire>(request,`/admin/articles?${params}`,{signal});
  const page = Number.isSafeInteger(result.page) && result.page > 0 ? result.page : requestedPage;
  return { items: result.items.map(fromWire), pageNumber: page, pageSize: result.pageSize, totalItems: result.totalItems };
}
export async function getArticle(request:AdminRequest,id:number,signal?:AbortSignal):Promise<Article>{return fromWire(await json<ArticleWire>(request,`/admin/articles/${id}`,{signal}));}
export function saveArticle(request:AdminRequest,id:number|null,input:ArticleInput){return json<ArticleWire>(request,id===null?'/admin/articles':`/admin/articles/${id}`,{method:id===null?'POST':'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(toWire(input))},'save article').then(fromWire);}
export function setArticlePublished(request:AdminRequest,id:number,published:boolean){return json<void>(request,`/admin/articles/${id}/${published?'publish':'unpublish'}`,{method:'POST'},published?'publish article':'unpublish article');}
export function deleteArticle(request:AdminRequest,id:number){return json<void>(request,`/admin/articles/${id}`,{method:'DELETE'},'delete article');}
export function getArticleAnalytics(request:AdminRequest,id:number,range:7|30|90,signal?:AbortSignal){return json<ArticleAnalytics>(request,`/admin/articles/${id}/analytics?range=${range}`,{signal},'load article analytics');}
