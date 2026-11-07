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
    publish_time TIMESTAMPTZ,
    is_public BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
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
    reviewed_at TIMESTAMPTZ,                       -- 结案时间
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()  -- 提交审核时间
);
-- 按文档查审核历史
CREATE INDEX IF NOT EXISTS idx_kh_document_review_document_id
    ON kh_document_review (document_id);
-- 同一文档同时最多一条待审：并发提审时由数据库拒绝第二条，同时服务待办查询
CREATE UNIQUE INDEX IF NOT EXISTS uq_kh_document_review_pending
    ON kh_document_review (document_id) WHERE review_result IS NULL;

-- ==================== 用户与角色 ====================

CREATE TABLE IF NOT EXISTS kh_user (
    id BIGINT PRIMARY KEY,                          -- 用户 ID（雪花）
    username VARCHAR(50) NOT NULL,                  -- 登录用户名
    password VARCHAR(255) NOT NULL,                 -- 密码（bcrypt 哈希）
    email VARCHAR(100),                             -- 邮箱（可选）
    real_name VARCHAR(50),                          -- 真实姓名 / 显示名
    avatar VARCHAR(500),                            -- 头像 URL
    email_verified SMALLINT NOT NULL DEFAULT 1,     -- 0 未验证 1 已验证
    status SMALLINT NOT NULL DEFAULT 1,             -- 0 禁用 1 启用
    last_login_at TIMESTAMPTZ,                        -- 最后登录时间
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),    -- 创建时间
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),    -- 更新时间
    deleted BOOLEAN NOT NULL DEFAULT false          -- 软删除标记
);
-- 未删除用户名唯一
CREATE UNIQUE INDEX IF NOT EXISTS uk_kh_user_username ON kh_user(username) WHERE deleted = false;
-- 未删除用户邮箱唯一（邮箱可空，NULL 不参与唯一约束）
CREATE UNIQUE INDEX IF NOT EXISTS uk_kh_user_email ON kh_user(email) WHERE deleted = false;

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
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),    -- 分配时间
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

-- ==================== 权限 RBAC ====================

-- 权限表：菜单 / 按钮 / 接口三类权限组成一棵树；接口上 @RequirePermission 校验的是 permission_code
CREATE TABLE IF NOT EXISTS kh_permission (          -- 表不存在才创建，重复执行不报错
    id BIGINT PRIMARY KEY,                          -- 权限 ID（雪花），主键
    parent_id BIGINT NOT NULL DEFAULT 0,            -- 父权限 ID，0 为根；不设外键，靠程序维护
    permission_name VARCHAR(50) NOT NULL,           -- 权限名称，展示用，如「文档列表」
    permission_code VARCHAR(100) NOT NULL UNIQUE,   -- 权限编码，全表唯一（含已软删的行），如 document:list
    permission_type SMALLINT NOT NULL,              -- 权限类型：1 菜单 2 按钮 3 接口
    menu_url VARCHAR(200),                          -- 菜单对应的前端路由，可空
    api_url VARCHAR(500),                           -- 接口 URL 模式，只做记录，不参与校验，可空
    method VARCHAR(10),                             -- 接口 HTTP 方法，只做记录，可空
    icon VARCHAR(50),                               -- 菜单图标名，可空
    sort INT NOT NULL DEFAULT 0,                    -- 同级排序，越小越靠前
    status SMALLINT NOT NULL DEFAULT 1,             -- 0 禁用 1 启用；禁用的权限不生效
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- 创建时间（带时区）
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- 更新时间（带时区）
    deleted BOOLEAN NOT NULL DEFAULT false          -- 软删标记，true 表示已删除
);                                                  -- kh_permission 结束

-- 角色-权限关联表：一行表示「某角色拥有某权限」
CREATE TABLE IF NOT EXISTS kh_role_permission (     -- 表不存在才创建
    id BIGINT PRIMARY KEY,                          -- 关联 ID（雪花），主键
    role_id BIGINT NOT NULL REFERENCES kh_role(id), -- 角色 ID，外键：角色必须存在
    permission_id BIGINT NOT NULL REFERENCES kh_permission(id), -- 权限 ID，外键：权限必须存在
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- 绑定时间
    UNIQUE (role_id, permission_id)                 -- 同一角色不能重复绑同一权限
);                                                  -- kh_role_permission 结束

-- 用户直接权限表：一行表示「某用户直接拥有某权限」，与角色权限合并生效
CREATE TABLE IF NOT EXISTS kh_user_permission (     -- 表不存在才创建
    id BIGINT PRIMARY KEY,                          -- 关联 ID（雪花），主键
    user_id BIGINT NOT NULL REFERENCES kh_user(id), -- 用户 ID，外键：用户必须存在
    permission_id BIGINT NOT NULL REFERENCES kh_permission(id), -- 权限 ID，外键：权限必须存在
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- 绑定时间
    UNIQUE (user_id, permission_id)                 -- 同一用户不能重复绑同一权限
);                                                  -- kh_user_permission 结束

-- 预置一级菜单（parent_id = 0，类型 1 菜单）
INSERT INTO kh_permission (id, parent_id, permission_name, permission_code, permission_type, menu_url, icon, sort) VALUES -- 要写入的列
    (4000000000000000001, 0, '首页', 'dashboard', 1, '/dashboard', 'DashboardOutlined', 1),           -- 首页菜单
    (4000000000000000002, 0, '文档中心', 'document', 1, '/documents', 'FileTextOutlined', 2),         -- 文档中心菜单
    (4000000000000000003, 0, '搜索', 'search', 1, '/search', 'SearchOutlined', 3),                    -- 搜索菜单
    (4000000000000000004, 0, '个人中心', 'profile', 1, '/profile', 'UserOutlined', 4),                -- 个人中心菜单
    (4000000000000000005, 0, '系统管理', 'system', 1, '/admin', 'SettingOutlined', 5)                 -- 系统管理菜单
ON CONFLICT (id) DO NOTHING;                        -- id 已存在则跳过，重复执行不报错

-- 预置「文档中心」下的按钮权限（parent_id = 文档中心，类型 2 按钮）
INSERT INTO kh_permission (id, parent_id, permission_name, permission_code, permission_type, sort) VALUES -- 要写入的列
    (4000000000000000011, 4000000000000000002, '文档列表', 'document:list', 2, 1),     -- 查看文档列表
    (4000000000000000012, 4000000000000000002, '创建文档', 'document:create', 2, 2),   -- 创建文档
    (4000000000000000013, 4000000000000000002, '编辑文档', 'document:edit', 2, 3),     -- 编辑文档
    (4000000000000000014, 4000000000000000002, '删除文档', 'document:delete', 2, 4),   -- 删除文档
    (4000000000000000015, 4000000000000000002, '文档审核', 'document:review', 2, 5)    -- 审核文档
ON CONFLICT (id) DO NOTHING;                        -- id 已存在则跳过

-- 预置「系统管理」下的子菜单（parent_id = 系统管理，类型 1 菜单）
INSERT INTO kh_permission (id, parent_id, permission_name, permission_code, permission_type, menu_url, sort) VALUES -- 要写入的列
    (4000000000000000021, 4000000000000000005, '用户管理', 'system:user', 1, '/admin/users', 1),             -- 用户管理（/users 部分接口校验）
    (4000000000000000022, 4000000000000000005, '角色管理', 'system:role', 1, '/admin/roles', 2),             -- 角色管理（/roles/:id/permissions 校验）
    (4000000000000000023, 4000000000000000005, '权限管理', 'system:permission', 1, '/admin/permissions', 3), -- 权限管理（/permissions 读接口校验）
    (4000000000000000024, 4000000000000000005, '团队管理', 'system:team', 1, '/admin/teams', 4)              -- 团队管理（/teams 接口校验）
ON CONFLICT (id) DO NOTHING;                        -- id 已存在则跳过

-- 预置「权限管理」下的按钮权限（parent_id = 权限管理，类型 2 按钮）
INSERT INTO kh_permission (id, parent_id, permission_name, permission_code, permission_type, sort) VALUES -- 要写入的列
    (4000000000000000041, 4000000000000000023, '新增权限', 'system:permission:create', 2, 1), -- POST /permissions 校验
    (4000000000000000042, 4000000000000000023, '编辑权限', 'system:permission:edit', 2, 2),   -- PUT /permissions/:id 校验
    (4000000000000000043, 4000000000000000023, '删除权限', 'system:permission:delete', 2, 3)  -- DELETE /permissions/:id 校验
ON CONFLICT (id) DO NOTHING;                        -- id 已存在则跳过

-- 预置角色权限：审核员（2000…002）、普通用户（2000…003）；管理员不用绑，代码里自动拥有全部操作权限
INSERT INTO kh_role_permission (id, role_id, permission_id) VALUES -- 要写入的列
    (4100000000000000001, 2000000000000000002, 4000000000000000011), -- 审核员 → 文档列表
    (4100000000000000002, 2000000000000000002, 4000000000000000015), -- 审核员 → 文档审核
    (4100000000000000003, 2000000000000000003, 4000000000000000001), -- 普通用户 → 首页
    (4100000000000000004, 2000000000000000003, 4000000000000000002), -- 普通用户 → 文档中心
    (4100000000000000005, 2000000000000000003, 4000000000000000011), -- 普通用户 → 文档列表
    (4100000000000000006, 2000000000000000003, 4000000000000000012), -- 普通用户 → 创建文档
    (4100000000000000007, 2000000000000000003, 4000000000000000003), -- 普通用户 → 搜索
    (4100000000000000008, 2000000000000000003, 4000000000000000004), -- 普通用户 → 个人中心
    (4100000000000000009, 2000000000000000003, 4000000000000000013), -- 普通用户 → 编辑文档（发布 / 归档 / 存草稿 / 提审 / 修改）
    (4100000000000000010, 2000000000000000003, 4000000000000000014), -- 普通用户 → 删除文档
    (4100000000000000011, 2000000000000000002, 4000000000000000003)  -- 审核员 → 搜索（POST /search）
ON CONFLICT (id) DO NOTHING;                        -- id 已存在则跳过

-- ==================== 团队 ====================

-- 团队表：parent_id 组成团队树
CREATE TABLE IF NOT EXISTS kh_team (                -- 表不存在才创建
    id BIGINT PRIMARY KEY,                          -- 团队 ID（雪花），主键
    team_name VARCHAR(100) NOT NULL,                -- 团队名称
    team_code VARCHAR(50),                          -- 团队编码，可空，不要求唯一
    description VARCHAR(500),                       -- 描述，可空
    leader_id BIGINT,                               -- 负责人 → kh_user.id，可空；不设外键
    parent_id BIGINT NOT NULL DEFAULT 0,            -- 父团队 ID，0 为根；不设外键
    sort INT NOT NULL DEFAULT 0,                    -- 同级排序，越小越靠前
    status SMALLINT NOT NULL DEFAULT 1,             -- 0 禁用 1 启用；禁用的团队不出现在团队树
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- 创建时间
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- 更新时间
    deleted BOOLEAN NOT NULL DEFAULT false          -- 软删标记
);                                                  -- kh_team 结束
CREATE INDEX IF NOT EXISTS idx_kh_team_parent_id ON kh_team(parent_id); -- 按父团队查子团队用的索引

-- 团队成员表：一行表示「某用户在某团队里」
CREATE TABLE IF NOT EXISTS kh_team_member (         -- 表不存在才创建
    id BIGINT PRIMARY KEY,                          -- 关联 ID（雪花），主键
    team_id BIGINT NOT NULL REFERENCES kh_team(id), -- 团队 ID，外键：团队必须存在
    user_id BIGINT NOT NULL REFERENCES kh_user(id), -- 用户 ID，外键：用户必须存在（所以 init 时无法预置成员）
    member_role VARCHAR(20) NOT NULL DEFAULT 'member', -- 成员身份：leader 负责人 / member 普通成员
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- 加入时间
    UNIQUE (team_id, user_id)                       -- 同一用户在同一团队只能有一行
);                                                  -- kh_team_member 结束
CREATE INDEX IF NOT EXISTS idx_kh_team_member_user_id ON kh_team_member(user_id); -- 按用户查所在团队用的索引

-- 预置团队；init 时还没有任何账号：负责人与 leader 成员行由服务在新建初始管理员（AUTH_BOOTSTRAP_ADMIN_*）时写入
INSERT INTO kh_team (id, team_name, team_code, description, leader_id, parent_id, sort) VALUES -- 要写入的列
    (8000000000000000001, '技术中心', 'TECH_CENTER', '研发与技术团队', NULL, 0, 1),                    -- 根团队，负责人先留空
    (8000000000000000002, '后端开发组', 'BACKEND_TEAM', '后端开发', NULL, 8000000000000000001, 1)      -- 技术中心的子团队
ON CONFLICT (id) DO NOTHING;                        -- id 已存在则跳过

-- ==================== AI 会话 ====================

-- AI 会话表：一行表示某个用户的一次连续问答
CREATE TABLE IF NOT EXISTS kh_ai_session (                    -- 表不存在才创建，重复执行不报错
    id BIGINT PRIMARY KEY,                                    -- 会话 ID（雪花），主键
    user_id BIGINT NOT NULL,                                  -- 所属用户 ID；不设外键，与源实现一致
    title VARCHAR(80) NOT NULL,                               -- 会话标题，最多 80 字
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),            -- 会话创建时间（带时区）
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()             -- 最后问答或重命名时间（带时区）
);                                                            -- kh_ai_session 结束
-- 按用户查询会话列表时直接按更新时间倒序扫描索引
CREATE INDEX IF NOT EXISTS idx_kh_ai_session_user_updated     -- 索引不存在才创建
    ON kh_ai_session(user_id, updated_at DESC);               -- 先按用户过滤，再按更新时间倒序

-- AI 消息表：一行表示用户问题或助手回答
CREATE TABLE IF NOT EXISTS kh_ai_message (                    -- 表不存在才创建，重复执行不报错
    id BIGINT PRIMARY KEY,                                    -- 消息 ID（雪花），主键
    session_id BIGINT NOT NULL REFERENCES kh_ai_session(id) ON DELETE CASCADE, -- 所属会话；删会话时级联删消息
    role VARCHAR(16) NOT NULL,                                -- 消息角色：user / assistant
    content TEXT NOT NULL,                                    -- 用户问题或助手完整回答
    sources JSONB,                                            -- 助手回答引用的资料摘录；用户消息为空
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()             -- 消息创建时间（带时区）
);                                                            -- kh_ai_message 结束
-- 按会话读取完整消息时间线
CREATE INDEX IF NOT EXISTS idx_kh_ai_message_session_id       -- 索引不存在才创建
    ON kh_ai_message(session_id, created_at);                 -- 先按会话过滤，再按创建时间正序
