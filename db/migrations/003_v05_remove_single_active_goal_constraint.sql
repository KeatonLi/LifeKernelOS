-- 产品 0.5 兼容修复：移除旧版“每个用户只能有一个 active 主线”的索引。
-- 该索引会阻止同一用户维护多个 active 长期目标。
DROP INDEX IF EXISTS focuses_one_active_per_user;
