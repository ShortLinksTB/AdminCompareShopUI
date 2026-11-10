import type { AdminRequest } from '../products/products-api';

export type ArticleStatus = 'Draft' | 'Published';
export type ArticleCategory = 'Kinh nghiệm mua sắm' | 'Đánh giá sản phẩm' | 'Xu hướng thị trường';
export interface Article { id: number; title: string; slug: string; category: ArticleCategory; excerptText: string; contentMarkdown: string; coverFileId: string | null; tags: string | null; status: ArticleStatus; authorName: string; publishedAtUtc: string | null; createdAtUtc: string; updatedAtUtc: string; totalViews: number; }
export interface ArticlePage { items: Article[]; pageNumber: number; pageSize: number; totalItems: number; }
export interface ArticleInput { title: string; slug: string; category: ArticleCategory; excerptText: string; contentMarkdown: string; coverFileId: string | null; tags: string | null; }
export interface DailyView { dateUtc: string; views: number; }
export interface ArticleAnalytics { dailyViews: DailyView[]; }
export class ArticlesApiError extends Error { constructor(message: string, readonly status: number) { super(message); this.name = 'ArticlesApiError'; } }
async function json<T>(request: AdminRequest, path: string, init?: RequestInit, action = 'load articles'): Promise<T> { const response = await request(path, init); if (!response.ok) throw new ArticlesApiError(response.status === 401 || response.status === 403 ? `You do not have permission to ${action}.` : `Could not ${action} (request failed with status ${response.status}).`, response.status); return response.status === 204 ? undefined as T : response.json() as Promise<T>; }
export function getArticles(request: AdminRequest, query: {page:number;pageSize:number;q:string;category:string;status:string}, signal?:AbortSignal) { const params = new URLSearchParams({page:String(query.page),pageSize:String(query.pageSize)}); if(query.q.trim())params.set('q',query.q.trim());if(query.category!=='all')params.set('category',query.category);if(query.status!=='all')params.set('status',query.status);return json<ArticlePage>(request,`/admin/articles?${params}`,{signal}); }
export function getArticle(request:AdminRequest,id:number,signal?:AbortSignal){return json<Article>(request,`/admin/articles/${id}`,{signal});}
export function saveArticle(request:AdminRequest,id:number|null,input:ArticleInput){return json<Article>(request,id===null?'/admin/articles':`/admin/articles/${id}`,{method:id===null?'POST':'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)},'save article');}
export function setArticlePublished(request:AdminRequest,id:number,published:boolean){return json<void>(request,`/admin/articles/${id}/${published?'publish':'unpublish'}`,{method:'POST'},published?'publish article':'unpublish article');}
export function deleteArticle(request:AdminRequest,id:number){return json<void>(request,`/admin/articles/${id}`,{method:'DELETE'},'delete article');}
export function getArticleAnalytics(request:AdminRequest,id:number,range:7|30|90,signal?:AbortSignal){return json<ArticleAnalytics>(request,`/admin/articles/${id}/analytics?range=${range}`,{signal},'load article analytics');}
