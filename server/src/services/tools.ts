import type { Task, TaskTool } from '../../../shared/types.ts';

export type ToolName = Exclude<TaskTool, 'auto'>;

export type ToolContext = {
  goal: string;
  task: Task;
  dependencyOutputs: { title: string; output: string }[];
};

export type ToolResult = {
  output: string;
  artifact?: { type: string; name: string; content: string };
};

export type ToolFn = (ctx: ToolContext) => Promise<ToolResult> | ToolResult;

/**
 * auto 推断：
 * - 撰写/正文/定稿类 → report
 * - 核查/审校/校验类 → text_check
 * - 其余（范围界定、资料收集、评估维度等）→ note
 */
export function resolveTool(task: Task): ToolName {
  if (task.tool !== 'auto') return task.tool as ToolName;
  if (/撰写|编写|正文|定稿|生成报告|整理成/.test(task.title)) return 'report';
  if (/核查|审校|检查|校验|验证|引用/.test(task.title)) return 'text_check';
  return 'note';
}

export const tools: Record<ToolName, ToolFn> = {
  /** 产出结构化笔记（确定性工具，不调用模型） */
  note({ task }) {
    const output = [
      `## 任务产出：${task.title}`,
      '',
      task.description || '（无补充说明）',
      '',
      `完成标准：${task.acceptanceCriteria || '（未提供）'}`,
      '',
      `生成时间：${new Date().toISOString()}`,
    ].join('\n');
    return { output };
  },

  /** 生成 Markdown 报告，并把报告存为 artifact */
  report({ goal, task, dependencyOutputs }) {
    const depSummary = dependencyOutputs.length
      ? dependencyOutputs
          .map((dep, index) => `${index + 1}. ${dep.title}：${(dep.output || '').replace(/\s+/g, ' ').slice(0, 120)}`)
          .join('\n')
      : '（无前置任务产出）';

    const output = [
      `# ${task.title}`,
      '',
      '## 执行范围',
      `- 任务：${task.title}`,
      `- 说明：${task.description || '（无补充说明）'}`,
      '',
      '## 目标',
      goal,
      '',
      '## 前置产出摘要',
      depSummary,
      '',
      '## 交付物',
      `- 完成标准：${task.acceptanceCriteria || '（未提供）'}`,
      `- 生成时间：${new Date().toISOString()}`,
      '',
      '## 结论',
      `本任务已完成「${task.title}」，产出已记录到 artifacts，可进入后续审校或交付。`,
      '',
    ].join('\n');

    return {
      output,
      artifact: { type: 'report', name: `${task.title}.md`, content: output },
    };
  },

  /** 检查前置产出：非空、长度、无占位内容 */
  text_check({ task, dependencyOutputs }) {
    const issues: string[] = [];
    const joined = dependencyOutputs.map((dep) => dep.output || '').join('\n').trim();

    if (joined.length === 0) issues.push('没有可检查的前置产出');
    else if (joined.length < 60) issues.push('前置产出过短（要求 ≥60 字符）');

    for (const bad of ['TODO', '待补充', 'Lorem ipsum', '???']) {
      if (joined.includes(bad)) issues.push(`发现占位内容：${bad}`);
    }

    const output = JSON.stringify({
      ok: issues.length === 0,
      issues,
      checkedTasks: dependencyOutputs.length,
      checkedChars: joined.length,
    });

    return {
      output,
      artifact: { type: 'check', name: `${task.title}.json`, content: output },
    };
  },
};