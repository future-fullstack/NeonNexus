/** JSON exchanged with the independent content service. No database access. */
export interface Post {
  id:string; slug:string; title:string; description:string; pubDate:string;
  updatedDate?:string; tags:string[]; body:string; heroImage?:string;
  visibility:'draft'|'public'; pendingChanges?:boolean;
}
export type PostSummary=Omit<Post,'body'>;
export interface ThreadMessage {id:string;author:'visitor'|'owner';body:string;createdAt:string;}
export interface Thread {id:string;createdAt:string;messages:ThreadMessage[];}
