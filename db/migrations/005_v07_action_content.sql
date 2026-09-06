-- 产品 0.7：To-do 需要保存独立的详细内容；NULL 表示旧记录尚未填写内容。
ALTER TABLE actions ADD COLUMN content TEXT;
