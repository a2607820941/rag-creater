/**
 * 知识组织模块共享类型，隔离前端组件和后端接口的稳定数据结构。
 */

/** 分类接口返回给前端使用的数据结构。 */
export type KnowledgeCategoryDto = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

/** 分类创建和编辑表单提交的数据结构。 */
export type KnowledgeCategoryFormValues = {
  name: string;
  description?: string | null;
  color?: string | null;
  sortOrder?: number;
};

/** 标签接口返回给前端使用的数据结构。 */
export type KnowledgeTagDto = {
  id: string;
  name: string;
  color: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

/** 标签创建表单提交的数据结构。 */
export type KnowledgeTagFormValues = {
  name: string;
  color?: string | null;
  sortOrder?: number;
};

/** 最近搜索记录条目。 */
export type RecentKnowledgeSearch = {
  keyword: string;
  searchedAt: string;
};

/** 最近搜索记录 hook 的配置项。 */
export type UseRecentKnowledgeSearchesOptions = {
  storageKey?: string;
  maxItems?: number;
};
