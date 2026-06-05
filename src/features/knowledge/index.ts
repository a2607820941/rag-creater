/**
 * 知识组织模块统一导出入口，供页面侧接入分类和标签能力。
 */

export type {
  KnowledgeCategoryDto,
  KnowledgeCategoryFormValues,
  KnowledgeTagDto,
  KnowledgeTagFormValues,
  RecentKnowledgeSearch,
  UseRecentKnowledgeSearchesOptions,
} from "@/features/knowledge/types";

export {
  CategoryForm,
  CategoryManager,
  KnowledgeSearchBox,
  RecentSearches,
  SearchHighlight,
  TagForm,
  TagManager,
} from "@/features/knowledge/components";

export type {
  KnowledgeSearchBoxProps,
  RecentSearchesProps,
  SearchHighlightProps,
} from "@/features/knowledge/components";

export { useRecentKnowledgeSearches } from "@/features/knowledge/hooks/use-recent-knowledge-searches";
