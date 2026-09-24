import {boundary,workspace,json} from '@/lib/server';
import {revision,automaticBackup} from '@/lib/backups';
export async function GET(){return boundary(async()=>{const actor=await workspace(undefined,'sell'),user=actor.businessId;await automaticBackup(user);return json({ownerId:user,businessId:user,isOwner:actor.isOwner,permissions:[...actor.permissions],revision:await revision(user)});});}
