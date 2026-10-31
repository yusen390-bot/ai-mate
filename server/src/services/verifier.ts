import type { Task } from '../../../shared/types.ts';
import type { ToolName } from './tools.ts';

export type Verdict = { ok: boolean; issues: string[] };

/**
 * 结果验证器：只用确定性规则判定任务是否真正完成，不采信模型自评。
 * 不通过时由执行器记录失败并触发有限重试。
 */
export function verifyOutput(tool: ToolName, output: string, task: Task): Verdict {
  const issues: string[] = [];
  const text = (output ?? '').trim();

  if (text.length === 0) issues.push('输出为空');
  if (!task.acceptanceCriteria || task.acceptanceCriteria.trim().length === 0) {
    issues.push('任务缺少可验证的完成标准');
  }

  if (tool === 'report') {
    if (text.length < 150) issues.push('报告内容过短（要求 ≥150 字符）');
    const sections = (text.match(/^## /gm) ?? []).length;
    if (sections < 2) issues.push('报告缺少必要章节（要求 ≥2 个二级标题）');
  } else if (tool === 'text_check') {
    try {
      const parsed = JSON.parse(text) as { ok?: boolean; issues?: string[] };
      if (parsed.ok !== true) {
        issues.push(...(parsed.issues && parsed.issues.length > 0 ? parsed.issues : ['检查未通过']));
      }
    } catch {
      issues.push('检查结果不是合法 JSON');
    }
  } else if (text.length < 20) {
    issues.push('产出过短（要求 ≥20 字符）');
  }

  return { ok: issues.length === 0, issues };
}