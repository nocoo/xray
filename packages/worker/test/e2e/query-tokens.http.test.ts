import type { ManagedToken, QueryPage, QuerySources, QueryTokenAccess } from "@xray/shared";
import { describe, expect, test } from "vitest";
import { actorHeaders, dataOf, ingestHeaders, jsonFetch, rawHttp } from "./helpers.js";

const all: QueryTokenAccess = {mode:"all",watchlistIds:[],channelIds:[]};
async function mint(access=all, actor:"a"|"b"="a") {
 const r=await jsonFetch("/api/query-tokens",{method:"POST",headers:actorHeaders(actor),body:JSON.stringify({label:"Query reader",access})});expect(r.status).toBe(201);return dataOf<ManagedToken & {token:string}>(r.body);
}
async function sources(actor:"a"|"b"="a") {
 const headers=actorHeaders(actor);const name=`Query ${crypto.randomUUID()}`;
 const w=await jsonFetch("/api/watchlists",{method:"POST",headers,body:JSON.stringify({name})});expect(w.status).toBe(201);const watchlist=dataOf<{id:number}>(w.body);
 const c=await jsonFetch("/api/channels",{method:"POST",headers,body:JSON.stringify({name})});expect(c.status).toBe(201);const channel=dataOf<{id:number}>(c.body);
 const p=await jsonFetch("/api/push-tokens",{method:"POST",headers,body:JSON.stringify({label:name})});expect(p.status).toBe(201);const producer=dataOf<{id:number;token:string}>(p.body);
 const k=await jsonFetch(`/api/channels/${channel.id}/keys`,{method:"POST",headers,body:JSON.stringify({label:name})});expect(k.status).toBe(201);const key=dataOf<{id:number;token:string}>(k.body);
 const day=new Date().toISOString().slice(0,10), midnight=Date.parse(`${day}T00:00:00Z`);
 const pushed=await rawHttp("/api/v1/ingest/push",{method:"POST",headers:ingestHeaders(producer.token),body:JSON.stringify({watchlist_id:watchlist.id,options:{apply_window_hours:168},items:[0,1,2].map(i=>({source_type:"custom",external_id:`${name.replace(/ /g,"-")}-${i}`,created_at:new Date(midnight+i).toISOString(),body:{kind:"custom",title:"Query post",text:"Queryable body"}}))})});expect(pushed.status).toBe(200);expect(JSON.parse(pushed.text)).toMatchObject({accepted:3});
 for(const i of [0,1]) {const r=await rawHttp("/api/v1/ingest/articles",{method:"POST",headers:ingestHeaders(key.token),body:JSON.stringify({external_id:`q-${i}`,title:"Query report",report_date:day,markdown:"## Query Markdown"})});expect(r.status).toBe(201);}
 return {watchlist,channel,producer,key,day,midnight};
}
async function query(token:string,params="") {
 const r=await rawHttp(`/api/v1/query${params}`,{headers:ingestHeaders(token)});
 return {status:r.status,body:JSON.parse(r.text) as {success:boolean;data:QueryPage}};
}

describe("query credentials over native HTTP",()=>{
 test("queries each authorized source independently and discovers only live allowed IDs",async()=>{
  const account=await mint();const a=await sources();const b=await sources();const foreign=await sources("b");
  const selected=await mint({mode:"selected",watchlistIds:[a.watchlist.id,b.watchlist.id],channelIds:[a.channel.id]});
  const discover=async(token:string)=>{const r=await rawHttp("/api/v1/query/sources",{headers:ingestHeaders(token)});expect(r.status).toBe(200);return dataOf<QuerySources>(JSON.parse(r.text));};
  expect(await discover(selected.token)).toEqual({watchlists:[{id:a.watchlist.id,name:expect.any(String)},{id:b.watchlist.id,name:expect.any(String)}],channels:[{id:a.channel.id,name:expect.any(String)}]});
  const catalog=await discover(account.token);
  expect(catalog.watchlists.map(w=>w.id)).toEqual(expect.arrayContaining([a.watchlist.id,b.watchlist.id]));
  expect(catalog.channels.map(c=>c.id)).toContain(b.channel.id);
  expect(catalog.watchlists.map(w=>w.id)).not.toContain(foreign.watchlist.id);
  expect(catalog.channels.map(c=>c.id)).not.toContain(foreign.channel.id);
  for(const [selector,count] of [[`watchlistId=${a.watchlist.id}`,3],[`watchlistId=${b.watchlist.id}`,3],[`channelId=${a.channel.id}`,2]] as const) {
   const full=await query(selected.token,`?${selector}`);expect(full.status).toBe(200);expect(full.body.success).toBe(true);expect(full.body.data.items).toHaveLength(count);
   expect(full.body.data.items.every(i=>i.kind==="post"?selector===`watchlistId=${i.post.watchlistId}`:selector===`channelId=${i.article.channelId}`)).toBe(true);
   for(const order of ["asc","desc"]) {let cursor:string|null=null;const items:QueryPage["items"]=[];do {const page=await query(selected.token,`?${selector}&limit=1&order=${order}${cursor?`&cursor=${cursor}`:""}`);expect(page.status).toBe(200);items.push(...page.body.data.items);cursor=page.body.data.nextCursor;} while(cursor);expect(items).toEqual(order==="desc"?full.body.data.items:[...full.body.data.items].reverse());}
   const boundary=await query(selected.token,`?${selector}&start=${a.day}T00:00:00Z&end=${a.day}T00:00:00.001Z`);expect(boundary.status).toBe(200);expect(boundary.body.data.items).toHaveLength(count===3?1:2);expect(boundary.body.data.items.every(i=>i.timeMs===a.midnight)).toBe(true);
  }
  expect((await query(account.token,`?channelId=${b.channel.id}`)).body.data.items).toHaveLength(2);
  expect((await query(selected.token,`?channelId=${b.channel.id}`)).status).toBe(403);
  for(const selector of [`watchlistId=${foreign.watchlist.id}`,`channelId=${foreign.channel.id}`]) expect((await query(account.token,`?${selector}`)).status).toBe(404);
  const readState=await jsonFetch(`/api/channels/${a.channel.id}/articles`);expect(dataOf<{items:Array<{isRead:boolean}>}>(readState.body).items.every(i=>i.isRead===false)).toBe(true);
  const logs=await jsonFetch(`/api/watchlists/${a.watchlist.id}/ingest-logs`);expect(dataOf<unknown[]>(logs.body)).toHaveLength(1);
  await jsonFetch(`/api/watchlists/${a.watchlist.id}`,{method:"DELETE"});await jsonFetch(`/api/watchlists/${b.watchlist.id}`,{method:"DELETE"});await jsonFetch(`/api/channels/${a.channel.id}`,{method:"DELETE"});
  expect(await discover(selected.token)).toEqual({watchlists:[],channels:[]});
  expect((await query(selected.token,`?watchlistId=${a.watchlist.id}`)).status).toBe(404);
  expect((await query(selected.token,`?channelId=${a.channel.id}`)).status).toBe(404);
 });
 test("browser grants are tenant-validated atomically, metadata-only, kind-bound and revocable",async()=>{
  const a=await sources();const foreign=await sources("b");const token=await mint();
  const grants: QueryTokenAccess={mode:"selected",watchlistIds:[a.watchlist.id],channelIds:[a.channel.id]};
  const patched=await jsonFetch(`/api/query-tokens/${token.id}`,{method:"PATCH",body:JSON.stringify({label:"Selected reader",access:grants})});expect(patched.status).toBe(200);expect(dataOf(patched.body)).toEqual({updated:true});
  const list=await jsonFetch("/api/tokens");const metadata=dataOf<ManagedToken[]>(list.body);expect(metadata.find(t=>t.id===token.id)).toMatchObject({kind:"query",label:"Selected reader",queryAccess:grants,scopes:["query:read"],channelId:null});expect(JSON.stringify(list.body)).not.toContain(token.token);expect(JSON.stringify(list.body)).not.toContain("token_hash");
  for(const actor of ["a","b"] as const) {expect((await jsonFetch(`/api/query-tokens/${token.id}`,{method:"PATCH",headers:actorHeaders(actor),body:JSON.stringify({label:"Invalid",access:{...grants,channelIds:[foreign.channel.id]}})})).status).toBe(404);}
  expect((await jsonFetch("/api/query-tokens",{method:"POST",body:JSON.stringify({label:"Invalid",access:{...grants,watchlistIds:[foreign.watchlist.id]}})})).status).toBe(400);
  expect((await jsonFetch(`/api/query-tokens/${token.id}`,{method:"DELETE",headers:actorHeaders("b")})).status).toBe(404);
  expect((await query(token.token,`?watchlistId=${a.watchlist.id}`)).body.data.items).toHaveLength(3);
  for(const method of ["PATCH","DELETE"]){expect((await jsonFetch(`/api/push-tokens/${token.id}`,{method,body:method==="PATCH"?JSON.stringify({label:"Wrong kind"}):undefined})).status).toBe(404);expect((await jsonFetch(`/api/query-tokens/${a.producer.id}`,{method,body:method==="PATCH"?JSON.stringify({label:"Wrong kind",access:all}):undefined})).status).toBe(404);}
  expect(dataOf<Array<{id:number}>>((await jsonFetch("/api/push-tokens")).body).some(t=>t.id===token.id)).toBe(false);
  const deleted=await jsonFetch(`/api/query-tokens/${token.id}`,{method:"DELETE"});expect(deleted.status).toBe(200);expect(dataOf(deleted.body)).toEqual({revoked:true});expect((await query(token.token)).status).toBe(401);
  expect((await jsonFetch(`/api/query-tokens/${token.id}`,{method:"DELETE"})).status).toBe(404);
 });
 test("rejects invalid cursors/context, producer scopes, browser query and Bearer administration",async()=>{
  const a=await sources();const token=await mint({mode:"selected",watchlistIds:[a.watchlist.id],channelIds:[a.channel.id]});const second=await mint();
  const cursor=(await query(token.token,`?watchlistId=${a.watchlist.id}&limit=1`)).body.data.nextCursor;expect(cursor).toBeTruthy();
  for(const params of ["?cursor=broken",`?cursor=${cursor}&order=asc`,`?cursor=${cursor}&start=${a.day}T00:00:00Z`,"?limit=101","?start=2026-02-30T00:00:00Z","?end=2026-10-14T00:00:00.1234Z"]){expect((await query(token.token,`?watchlistId=${a.watchlist.id}&${params.slice(1)}`)).status).toBe(400);}
  expect((await query(second.token,`?watchlistId=${a.watchlist.id}&cursor=${cursor}`)).status).toBe(400);
  for(const params of ["", "?limit=1", `?watchlistId=${a.watchlist.id}&channelId=${a.channel.id}`, `?watchlistId=${a.watchlist.id}&watchlistId=${a.watchlist.id}`, `?channelId=${a.channel.id}&cursor=${cursor}`]) expect((await query(token.token,params)).status).toBe(400);
  for(const headers of [ingestHeaders(a.producer.token),ingestHeaders(a.key.token)]) expect((await rawHttp("/api/v1/query/sources",{headers})).status).toBe(403);
  expect((await rawHttp("/api/v1/query/sources",{headers:{host:"xray-ingest.worker.hexly.ai"}})).status).toBe(401);
  expect((await rawHttp("/api/v1/query/sources",{headers:actorHeaders("a",{host:"xray.hexly.ai"})})).status).toBe(404);
  expect((await query(a.producer.token)).status).toBe(403);expect((await query(a.key.token)).status).toBe(403);
  for(const [path,method] of [["/api/v1/ingest/graph","GET"],["/api/v1/ingest/push","POST"],["/api/v1/ingest/articles","POST"]]) expect((await rawHttp(path,{method,headers:ingestHeaders(token.token),body:method==="GET"?undefined:"{}"})).status).toBe(403);
  expect((await rawHttp("/api/v1/query",{headers:actorHeaders("a",{host:"xray.hexly.ai"})})).status).toBe(404);
  expect((await rawHttp("/api/v1/query",{headers:{host:"xray-ingest.worker.hexly.ai"}})).status).toBe(401);
  for(const [path,method] of [["/api/query-tokens","POST"],[`/api/query-tokens/${token.id}`,"PATCH"],[`/api/query-tokens/${token.id}`,"DELETE"]]) {
   const body=method==="DELETE"?undefined:JSON.stringify({label:"Unauthorized",access:all});
   expect((await rawHttp(path,{method,body,headers:ingestHeaders(token.token)})).status).toBe(404);
   expect((await rawHttp(path,{method,body,headers:ingestHeaders(token.token,{host:"xray.hexly.ai",origin:"https://xray.hexly.ai"})})).status).toBe(401);
   expect((await rawHttp(path,{method,body,headers:actorHeaders("a",{host:"xray.hexly.ai",origin:"https://evil.example"})})).status).toBe(403);
  }
 });
});
