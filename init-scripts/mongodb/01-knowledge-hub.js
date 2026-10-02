const databaseName = process.env.MONGO_INITDB_DATABASE || 'knowledge_hub';
const appUsername = process.env.MONGO_APP_USERNAME || 'agent_hub';
const appPassword = process.env.MONGO_APP_PASSWORD || 'agent_hub_password';

const knowledgeHubDb = db.getSiblingDB(databaseName);

knowledgeHubDb.createUser({
  user: appUsername,
  pwd: appPassword,
  roles: [{ role: 'readWrite', db: databaseName }],
});

// 文档正文：_id(ObjectId) ↔ kh_document.content_id，documentId ↔ kh_document.id
knowledgeHubDb.createCollection('document_content');
knowledgeHubDb.document_content.createIndex({ documentId: 1 }, { unique: true });
knowledgeHubDb.document_content.createIndex({ deleted: 1 });
