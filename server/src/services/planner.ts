import type { PlanDraft } from '../../../shared/types.ts';
import { chatCompletion } from '../model.ts';
import { parsePlanOutput } from './planRules.ts';

const SYSTEM_PROMPT = [
  '你是一个严谨的任务规划器。用户给出一个目标，你要把它拆成可执行、可验证的子任务。',
  '',
  '输出要求（必须严格遵守）：',
  '1. 只输出一个 JSON 对象。不要输出 markdown 代码块、解释或任何多余文字。',
  '2. JSON 结构：',
  '{"summary":"一句话说明整体思路","tasks":[{"ref":"t1","title":"任务标题","description":"具体做什么","acceptanceCriteria":"可验证的完成标准","requiresApproval":false,"tool":"auto","dependsOn":[]}]}',
  '3. tasks 数量 3 到 8 个；ref 必须形如 t1、t2… 且唯一。',
  '4. dependsOn 只能引用其他任务的 ref；没有依赖就写 []。',
  '5. tool 只能取 auto / report / text_check / note；不确定就写 auto。',
  '6. 每个任务必须有具体、可检查的 acceptanceCriteria（例如"包含 3 个可访问的来源链接"），不能写"完成即可"。',
  '7. 涉及外部发布、删除、付费等需要人确认的任务，requiresApproval 设为 true。',
  '8. 依赖关系必须无环；不要把无关任务串成一条长链。',
].join('\n');

export type GeneratePlanResult = { plan: PlanDraft; model: string; rawOutput: string };

/**
 * 调模型生成计划（只生成，不落库）。
 * 失败（超时 / 网络 / 非法输出）自动重试一次，仍失败则抛出原错误，
 * 由 errorHandler 转成 502/422 结构化响应，服务不崩。
 */
export async function generatePlan(goal: string): Promise<GeneratePlanResult> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const result = await chatCompletion(
        [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `目标：${goal}\n\n请输出计划 JSON。` },
        ],
        { temperature: 0.2, maxTokens: 2000 },
      );
      const plan = parsePlanOutput(result.content);
      return { plan, model: result.model, rawOutput: result.content.slice(0, 4000) };
    } catch (error) {
      lastError = error;
      if (attempt === 1) await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }

  throw lastError;
}