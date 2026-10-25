-- 文档元数据表
CREATE TABLE IF NOT EXISTS kh_document (
    id BIGINT PRIMARY KEY,
    title VARCHAR NOT NULL,
    content_id VARCHAR NOT NULL UNIQUE,
    summary VARCHAR,
    category_id BIGINT,
    team_id BIGINT,
    author_id BIGINT,
    cover_image VARCHAR,
    tags VARCHAR,
    status SMALLINT NOT NULL DEFAULT 0,
    remark VARCHAR,
    view_count INT NOT NULL DEFAULT 0,
    like_count INT NOT NULL DEFAULT 0,
    comment_count INT NOT NULL DEFAULT 0,
    favourite_count INT NOT NULL DEFAULT 0,
    word_count INT NOT NULL DEFAULT 0,
    publish_time TIMESTAMP,
    is_public BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    create_by BIGINT,
    update_by BIGINT,
    deleted BOOLEAN NOT NULL DEFAULT false
);

-- 文档发布审核记录：一次提交审核一行；结案后 review_result 非空，不再出现在待办
CREATE TABLE IF NOT EXISTS kh_document_review (
    id BIGINT PRIMARY KEY,                       -- 审核记录 ID（雪花）
    document_id BIGINT NOT NULL,                 -- 被审文档 ID → kh_document.id
    reviewer_id BIGINT,                          -- 审核人 ID；待审时为 NULL
    reviewer_name VARCHAR,                       -- 审核人姓名
    review_result SMALLINT,                      -- NULL 待审 / 1 通过 / 2 驳回 / 3 撤销
    review_comment VARCHAR,                      -- 审核意见（驳回必填）
    before_status SMALLINT NOT NULL,             -- 提审前文档 status
    reviewed_at TIMESTAMP,                       -- 结案时间
    created_at TIMESTAMP NOT NULL DEFAULT NOW()  -- 提交审核时间
);
-- 按文档查审核历史
CREATE INDEX IF NOT EXISTS idx_kh_document_review_document_id
    ON kh_document_review (document_id);
-- 同一文档同时最多一条待审：并发提审时由数据库拒绝第二条，同时服务待办查询
CREATE UNIQUE INDEX IF NOT EXISTS uq_kh_document_review_pending
    ON kh_document_review (document_id) WHERE review_result IS NULL;
