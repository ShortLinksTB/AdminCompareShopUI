import type { AdminRequest } from '../products/products-api';

export type ArticleStatus = 'Draft' | 'Published';
export type ArticleCategory = 'Kinh nghiệm mua sắm' | 'Đánh giá sản phẩm' | 'Xu hướng thị trường';
export interface Article { id: number; title: string; slug: string; category: ArticleCategory; excerptText: string; contentMarkdown: string; coverFileId: string | null; tags: string | null; status: ArticleStatus; authorName: string; publishedAtUtc: string | null; createdAtUtc: string; updatedAtUtc: string; totalViews: number; }
export interface ArticlePage { items: Article[]; pageNumber: number; pageSize: number; totalItems: number; }
export interface ArticleInput { title: string; slug: string; category: ArticleCategory; excerptText: string; contentMarkdown: string; coverFileId: string | null; tags: string | null; }
export type ArticleCategoryValue = 'shopping-tips' | 'product-reviews' | 'market-trends';
interface ArticleDto extends Omit<Article, 'category' | 'tags'> { category: ArticleCategoryValue; tags: string[] | null; }
interface ArticlePageDto { items: ArticleDto[]; page: number; pageSize: number; totalItems: number; }
export interface DailyView { dateUtc: string; views: number; }
export interface ArticleAnalytics { dailyViews: DailyView[]; }
export class ArticlesApiError extends Error { constructor(message: string, readonly status: number) { super(message); this.name = 'ArticlesApiError'; } }
async function serverErrorMessage(response: Response, action: string): Promise<string> {
  if (response.status === 401 || response.status === 403) return `You do not have permission to ${action}.`;
  try {
    const body = await response.clone().json() as { detail?: unknown; title?: unknown; errors?: Record<string, unknown> };
    const errors = body.errors && Object.values(body.errors).flatMap(value => Array.isArray(value) ? value : [value]).filter((value): value is string => typeof value === 'string');
    if (errors?.length) return errors.join(' ');
    if (typeof body.detail === 'string' && body.detail.trim()) return body.detail;
    if (typeof body.title === 'string' && body.title.trim()) return body.title;
  } catch { /* Keep a useful status fallback for non-JSON responses. */ }
  return `Could not ${action} (request failed with status ${response.status}).`;
}
async function json<T>(request: AdminRequest, path: string, init?: RequestInit, action = 'load articles'): Promise<T> { const response = await request(path, init); if (!response.ok) throw new ArticlesApiError(await serverErrorMessage(response, action), response.status); return response.status === 204 ? undefined as T : response.json() as Promise<T>; }
const CATEGORY_TO_VALUE: Record<ArticleCategory, ArticleCategoryValue> = { 'Kinh nghiệm mua sắm': 'shopping-tips', 'Đánh giá sản phẩm': 'product-reviews', 'Xu hướng thị trường': 'market-trends' };
const VALUE_TO_CATEGORY = Object.fromEntries(Object.entries(CATEGORY_TO_VALUE).map(([label, value]) => [value, label])) as Record<ArticleCategoryValue, ArticleCategory>;
export function toArticleCategoryValue(category: ArticleCategory): ArticleCategoryValue { return CATEGORY_TO_VALUE[category]; }
export function fromArticleCategoryValue(category: ArticleCategoryValue): ArticleCategory { return VALUE_TO_CATEGORY[category]; }
export function toArticleTags(tags: string | null): string[] { return (tags ?? '').split(',').map(tag => tag.trim()).filter(Boolean); }
function fromArticleDto(article: ArticleDto): Article { return { ...article, category: fromArticleCategoryValue(article.category), tags: Array.isArray(article.tags) ? article.tags.join(', ') : null }; }
export async function getArticles(request: AdminRequest, query: {page:number;pageSize:number;q:string;category:string;status:string}, signal?:AbortSignal): Promise<ArticlePage> {
  const page = Number.isSafeInteger(query.page) && query.page > 0 ? query.page : 1;
  const params = new URLSearchParams({page:String(page),pageSize:String(query.pageSize)}); if(query.q.trim())params.set('q',query.q.trim());if(query.category!=='all')params.set('category',CATEGORY_TO_VALUE[query.category as ArticleCategory] ?? query.category);if(query.status!=='all')params.set('status',query.status);
  const result = await json<ArticlePageDto>(request,`/admin/articles?${params}`,{signal});
  return { items: result.items.map(fromArticleDto), pageNumber: Number.isSafeInteger(result.page) && result.page > 0 ? result.page : page, pageSize: result.pageSize, totalItems: result.totalItems };
}
export async function getArticle(request:AdminRequest,id:number,signal?:AbortSignal):Promise<Article>{return fromArticleDto(await json<ArticleDto>(request,`/admin/articles/${id}`,{signal}));}
export function saveArticle(request:AdminRequest,id:number|null,input:ArticleInput){const dto={...input,category:toArticleCategoryValue(input.category),tags:toArticleTags(input.tags)};return json<ArticleDto>(request,id===null?'/admin/articles':`/admin/articles/${id}`,{method:id===null?'POST':'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(dto)},'save article').then(fromArticleDto);}
export function setArticlePublished(request:AdminRequest,id:number,published:boolean){return json<void>(request,`/admin/articles/${id}/${published?'publish':'unpublish'}`,{method:'POST'},published?'publish article':'unpublish article');}
export function deleteArticle(request:AdminRequest,id:number){return json<void>(request,`/admin/articles/${id}`,{method:'DELETE'},'delete article');}
export function getArticleAnalytics(request:AdminRequest,id:number,range:7|30|90,signal?:AbortSignal){return json<ArticleAnalytics>(request,`/admin/articles/${id}/analytics?range=${range}`,{signal},'load article analytics');}
