import {boundary,owner,database,json} from '@/lib/server';
export async function GET(){return boundary(async()=>{const user=await owner(undefined,'recovery');const rows=await database().prepare('SELECT * FROM audit_events WHERE owner=? ORDER BY id DESC LIMIT 200').bind(user).all();return json(rows.results);});}
