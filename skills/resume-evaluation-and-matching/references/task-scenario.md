# Task Scenario

## Identity

- Domain: hr
- Intent: case_triage
- Audience: manager
- Output style: answer_with_citations

## Task Description

管理者提供候选人简历文本和岗位JD，Skill基于知识库中的评估方法论，对简历进行综合分析，输出匹配度评分、亮点、不足和建议。适用于招聘筛选、简历初评场景。

## When To Use

- 帮我筛选符合 Java 开发岗位的简历
- 这份简历有哪些亮点和不足？
- 根据岗位 JD 评估候选人的匹配度

## Do Not Use

- 不处理非简历类文档的分析
- 不生成简历内容或修改简历
- 不进行面试安排或招聘流程管理
- 不处理薪资谈判或offer相关事宜

## Enterprise Context

This Skill is designed for corporate information system workflows such as HR, finance, legal, procurement, approvals, workplace services, security, privacy, compliance, and AIGC enablement. Treat the configured knowledge bases as evidence sources, not as the Skill identity.
