# Task Scenario

## Identity

- Domain: general
- Intent: qa
- Audience: external_agent
- Output style: answer_with_citations

## Task Description

面向消费者的售后问题解答 Skill。用户遇到退换货、退款、物流异常、商品质量等售后问题时，通过本 Skill 获取基于知识库的准确解答。输出需引用知识库原文，若知识库无匹配内容则引导用户转人工客服。

## When To Use

- 商品有质量问题怎么处理？
- 如何申请退款？
- 物流显示已签收但我没收到货怎么办？
- 退货的运费谁承担？
- 我的订单可以取消吗？

## Do Not Use

- 售前咨询（如商品推荐、价格查询、库存查询）
- 账号安全类问题（如密码找回、账号被盗、实名认证）
- 需要人工介入的复杂投诉或纠纷调解
- 非售后相关的通用知识问答

## Enterprise Context

This Skill is designed for corporate information system workflows such as HR, finance, legal, procurement, approvals, workplace services, security, privacy, compliance, and AIGC enablement. Treat the configured knowledge bases as evidence sources, not as the Skill identity.
