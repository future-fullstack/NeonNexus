import {Marked} from 'marked';
import sanitizeHtml from 'sanitize-html';
import {decodeHTML} from 'entities';
import {withBase} from './paths';

export interface Heading {depth:number;slug:string;text:string;}
function escapeText(text:string){return text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');}
/** One renderer for published articles and owner preview. Raw HTML stays text. */
export function renderMarkdown(body:string) {
  const headings:Heading[]=[];
  const marked=new Marked({gfm:true,breaks:false});
  marked.use({renderer:{
    html(token){return escapeText(token.text);},
    heading(token){
      const slug=`section-${headings.length+1}`;
      const inline=this.parser.parseInline(token.tokens);
      const text=decodeHTML(sanitizeHtml(inline,{allowedTags:[],allowedAttributes:{}}));
      headings.push({depth:token.depth,slug,text});
      return `<h${token.depth} id="${slug}">${inline}</h${token.depth}>`;
    },
  }});
  const html=sanitizeHtml(marked.parse(body,{async:false}),{
    allowedTags:['p','br','hr','h1','h2','h3','h4','h5','h6','strong','em','del','blockquote','ul','ol','li','pre','code','table','thead','tbody','tr','th','td','a','img'],
    allowedAttributes:{a:['href','title','rel'],img:['src','alt','title','loading'],code:['class'],h1:['id'],h2:['id'],h3:['id'],h4:['id'],h5:['id'],h6:['id'],ol:['start']},
    allowedSchemes:['http','https','mailto'],allowedSchemesByTag:{img:['http','https']},allowProtocolRelative:false,
    transformTags:{
      a:(tag,attr)=>({tagName:tag,attribs:{...attr,href:attr.href?withBase(attr.href):'',rel:'noopener noreferrer'}}),
      img:(tag,attr)=>({tagName:tag,attribs:{...attr,src:attr.src?withBase(attr.src):'',loading:'lazy'}}),
    },
  });
  return {html,headings};
}
