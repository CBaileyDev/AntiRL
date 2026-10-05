use super::*;
pub const PROMPT_VERSION:&str="coach-3";
pub fn migrate(db:&Connection,dir:&Path)->ServiceResult<()> {
 let exists:bool=db.prepare("PRAGMA table_info(conversations)").map_err(err)?.query_map([],|r|r.get::<_,String>(1)).map_err(err)?.flatten().any(|s|s=="mode");
 if exists{return Ok(());}
 let backup=dir.join("coach-before-scope-v2.sqlite3");
 if !backup.exists(){db.execute("VACUUM INTO ?1",[backup.to_string_lossy().as_ref()]).map_err(err)?;}
 db.execute_batch("BEGIN IMMEDIATE;
 ALTER TABLE conversations ADD COLUMN mode TEXT NOT NULL DEFAULT 'All';
 ALTER TABLE conversations ADD COLUMN preset TEXT NOT NULL DEFAULT 'Balanced';
 ALTER TABLE conversations ADD COLUMN prompt_version TEXT NOT NULL DEFAULT 'legacy';
 ALTER TABLE conversations ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
 CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL);
 INSERT OR IGNORE INTO schema_migrations VALUES(2,datetime('now')); COMMIT;").map_err(err)
}
impl CoachService {
 pub fn create_conversation(&self,mode:&str,preset:&str)->ServiceResult<Value>{
  validate_scope(mode,preset)?; let id=ident();let date=now();
  self.db.lock().map_err(err)?.execute("INSERT INTO conversations(id,title,updated_at,mode,preset,prompt_version) VALUES(?1,'New chat',?2,?3,?4,?5)",params![id,date,mode,preset,PROMPT_VERSION]).map_err(err)?;
  Ok(json!({"id":id,"title":"New chat","updated_at":date,"mode":mode,"preset":preset,"prompt_version":PROMPT_VERSION}))
 }
 pub fn update_conversation(&self,id:&str,title:&str,archived:bool)->ServiceResult<()> {
  let title=title.trim();if title.is_empty() || title.chars().count()>100{return Err("Title must be 1-100 characters".into());}
  self.db.lock().map_err(err)?.execute("UPDATE conversations SET title=?2,archived=?3,updated_at=?4 WHERE id=?1",params![id,title,archived,now()]).map_err(err)?;Ok(())
 }
 pub fn conversation_scope(&self,id:&str)->ServiceResult<(String,String)>{self.db.lock().map_err(err)?.query_row("SELECT mode,preset FROM conversations WHERE id=?1",[id],|r|Ok((r.get(0)?,r.get(1)?))).map_err(err)}
}
fn validate_scope(mode:&str,preset:&str)->ServiceResult<()> {
 if !["All","1v1","2v2","3v3"].contains(&mode) || !["Balanced","Mechanics practice","Decision review","Match breakdown"].contains(&preset){return Err("Unsupported conversation scope".into());} Ok(())
}

#[cfg(test)] mod tests {
 use super::*;
 #[test] fn legacy_records_survive_scope_migration_and_repeated_open(){
  let dir=tempfile::tempdir().unwrap();let db=Connection::open(dir.path().join("legacy.sqlite3")).unwrap();
  db.execute_batch("CREATE TABLE conversations(id TEXT PRIMARY KEY,title TEXT,updated_at TEXT);CREATE TABLE messages(id TEXT,conversation_id TEXT,body TEXT);INSERT INTO conversations VALUES('old','Existing chat','2026-01-01');INSERT INTO messages VALUES('msg','old','{\"role\":\"assistant\",\"content\":\"Legacy content retained\"}');").unwrap();
  migrate(&db,dir.path()).unwrap();migrate(&db,dir.path()).unwrap();
  let (mode,version,archived):(String,String,i32)=db.query_row("SELECT mode,prompt_version,archived FROM conversations WHERE id='old'",[],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).unwrap();
  assert_eq!((mode,version,archived),("All".into(),"legacy".into(),0));
  let body:String=db.query_row("SELECT body FROM messages WHERE id='msg'",[],|r|r.get(0)).unwrap();assert!(body.contains("Legacy content retained"));
  let backup=Connection::open(dir.path().join("coach-before-scope-v2.sqlite3")).unwrap();let count:i32=backup.query_row("SELECT COUNT(*) FROM messages",[],|r|r.get(0)).unwrap();assert_eq!(count,1);
 }
}
