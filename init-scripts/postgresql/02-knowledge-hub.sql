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

-- ==================== 用户与角色（第一期：简化注册，注册后立即可登录） ====================

CREATE TABLE IF NOT EXISTS kh_user (
    id BIGINT PRIMARY KEY,                          -- 用户 ID（雪花）
    username VARCHAR(50) NOT NULL,                  -- 登录用户名
    password VARCHAR(255) NOT NULL,                 -- 密码（bcrypt 哈希）
    email VARCHAR(100),                             -- 邮箱（可选）
    real_name VARCHAR(50),                          -- 真实姓名 / 显示名
    avatar VARCHAR(500),                            -- 头像 URL
    email_verified SMALLINT NOT NULL DEFAULT 1,     -- 0 未验证 1 已验证
    status SMALLINT NOT NULL DEFAULT 1,             -- 0 禁用 1 启用
    last_login_at TIMESTAMP,                        -- 最后登录时间
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),    -- 创建时间
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),    -- 更新时间
    deleted BOOLEAN NOT NULL DEFAULT false          -- 软删除标记
);
-- 未删除用户名唯一
CREATE UNIQUE INDEX IF NOT EXISTS uk_kh_user_username ON kh_user(username) WHERE deleted = false;

CREATE TABLE IF NOT EXISTS kh_role (
    id BIGINT PRIMARY KEY,                          -- 角色 ID（雪花）
    role_name VARCHAR(50) NOT NULL,                 -- 角色名称（展示用）
    role_code VARCHAR(50) NOT NULL UNIQUE,          -- 角色编码，如 ROLE_ADMIN / ROLE_REVIEWER / ROLE_USER
    description VARCHAR(200),                       -- 角色描述
    status SMALLINT NOT NULL DEFAULT 1              -- 0 禁用 1 启用
);

CREATE TABLE IF NOT EXISTS kh_user_role (
    id BIGINT PRIMARY KEY,                          -- 关联 ID（雪花）
    user_id BIGINT NOT NULL REFERENCES kh_user(id), -- 用户 ID
    role_id BIGINT NOT NULL REFERENCES kh_role(id), -- 角色 ID
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),    -- 分配时间
    UNIQUE (user_id, role_id)
);
CREATE INDEX IF NOT EXISTS idx_kh_user_role_user_id ON kh_user_role(user_id);

-- 预置角色
INSERT INTO kh_role (id, role_name, role_code, description) VALUES
    (2000000000000000001, '管理员', 'ROLE_ADMIN', '系统管理'),
    (2000000000000000002, '审核员', 'ROLE_REVIEWER', '文档审核'),
    (2000000000000000003, '普通用户', 'ROLE_USER', '默认角色')
ON CONFLICT (id) DO NOTHING;

-- 不预置账号（同一 init 目录也用于 docker:up:prod）：初始管理员由 AUTH_BOOTSTRAP_ADMIN_* 在启动时创建
