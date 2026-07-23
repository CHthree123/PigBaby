import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Project, ProjectStage, ProjectsData } from '../storage';
import { loadProjects, saveProjects } from '../storage';
import EmptyState from './EmptyState';

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [projName, setProjName] = useState('');
  const [projDesc, setProjDesc] = useState('');
  const [hideCompleted, setHideCompleted] = useState(true);
  const [showCompletedList, setShowCompletedList] = useState(false);

  // Stage editing
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [stageName, setStageName] = useState('');

  const refresh = useCallback(async () => {
    const d = await loadProjects();
    setProjects(d.projects);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const activeProjects = useMemo(
    () => projects.filter((p) => !p.completed).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [projects]
  );

  const completedProjects = useMemo(
    () => projects.filter((p) => p.completed).sort((a, b) => b.completedAt?.localeCompare(a.completedAt ?? '') ?? 0),
    [projects]
  );

  const handleCreateProject = async () => {
    if (!projName.trim()) return;
    const project: Project = {
      id: Date.now().toString(),
      name: projName.trim(),
      description: projDesc.trim(),
      stages: [],
      completed: false,
      completedAt: null,
      createdAt: new Date().toISOString(),
    };
    const updated: ProjectsData = { projects: [project, ...projects] };
    await saveProjects(updated);
    setProjName('');
    setProjDesc('');
    setShowNew(false);
    await refresh();
  };

  const handleDeleteProject = async (id: string) => {
    const updated: ProjectsData = { projects: projects.filter((p) => p.id !== id) };
    await saveProjects(updated);
    await refresh();
  };

  const handleToggleProjectComplete = async (projectId: string) => {
    const updated = projects.map((p) => {
      if (p.id !== projectId) return p;
      const nowComplete = !p.completed;
      return {
        ...p,
        completed: nowComplete,
        completedAt: nowComplete ? new Date().toISOString() : null,
      };
    });
    await saveProjects({ projects: updated });
    await refresh();
  };

  const handleAddStage = async (projectId: string) => {
    if (!stageName.trim()) return;
    const updated = projects.map((p) => {
      if (p.id !== projectId) return p;
      const newStage: ProjectStage = {
        id: Date.now().toString(),
        name: stageName.trim(),
        completed: false,
        order: p.stages.length,
      };
      return { ...p, stages: [...p.stages, newStage] };
    });
    const data: ProjectsData = { projects: updated };
    await saveProjects(data);
    setStageName('');
    await refresh();
  };

  const handleToggleStage = async (projectId: string, stageId: string) => {
    const updated = projects.map((p) => {
      if (p.id !== projectId) return p;
      return {
        ...p,
        stages: p.stages.map((s) =>
          s.id === stageId ? { ...s, completed: !s.completed } : s
        ),
      };
    });
    const data: ProjectsData = { projects: updated };
    await saveProjects(data);
    await refresh();
  };

  const handleDeleteStage = async (projectId: string, stageId: string) => {
    const updated = projects.map((p) => {
      if (p.id !== projectId) return p;
      return { ...p, stages: p.stages.filter((s) => s.id !== stageId) };
    });
    const data: ProjectsData = { projects: updated };
    await saveProjects(data);
    await refresh();
  };

  const handleMoveStage = async (projectId: string, stageId: string, direction: 'up' | 'down') => {
    const updated = projects.map((p) => {
      if (p.id !== projectId) return p;
      const stages = [...p.stages];
      const idx = stages.findIndex((s) => s.id === stageId);
      if (idx === -1) return p;
      if (direction === 'up' && idx > 0) {
        [stages[idx], stages[idx - 1]] = [stages[idx - 1], stages[idx]];
      } else if (direction === 'down' && idx < stages.length - 1) {
        [stages[idx], stages[idx + 1]] = [stages[idx + 1], stages[idx]];
      }
      return { ...p, stages: stages.map((s, i) => ({ ...s, order: i })) };
    });
    const data: ProjectsData = { projects: updated };
    await saveProjects(data);
    await refresh();
  };

  return (
    <div className="projects-page">
      <button className="piggy-new-btn" onClick={() => setShowNew(true)} style={{ alignSelf: 'center' }}>
        + 新建工程
      </button>

      {showNew && (
        <div className="ac-modal-overlay" onClick={() => setShowNew(false)}>
          <div className="ac-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-handle" />
            <h3>🏗 新建工程</h3>
            <div className="arm-field">
              <label className="arm-label">工程名称</label>
              <input className="arm-input" type="text" placeholder="例如：学习 React" value={projName} onChange={(e) => setProjName(e.target.value)} autoFocus />
            </div>
            <div className="arm-field">
              <label className="arm-label">描述（可选）</label>
              <textarea className="arm-input" placeholder="简单描述你的目标..." value={projDesc} onChange={(e) => setProjDesc(e.target.value)} rows={3} style={{ resize: 'vertical' }} />
            </div>
            <div className="ac-modal-btns">
              <button className="ac-modal-btn cancel" onClick={() => setShowNew(false)}>取消</button>
              <button className="ac-modal-btn confirm" onClick={handleCreateProject}>创建</button>
            </div>
          </div>
        </div>
      )}

      {projects.length === 0 ? (
        <EmptyState emoji="🏗" title="还没有工程~" tips={['设定一个大目标', '拆分成小阶段慢慢完成', '每一步都是进步']} />
      ) : (
        <>
          {/* Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none', WebkitUserSelect: 'none', fontSize: 12, color: 'var(--text-muted)' }}>
              <span>隐藏已完成</span>
              <span
                style={{
                  position: 'relative', display: 'inline-block', width: 40, height: 22,
                  borderRadius: 11, background: hideCompleted ? 'var(--primary, #FF9BB3)' : '#D0CCD0',
                  transition: 'background 0.25s', cursor: 'pointer',
                }}
                onClick={() => setHideCompleted((v) => !v)}
              >
                <span
                  style={{
                    position: 'absolute', top: 2, left: hideCompleted ? 20 : 2,
                    width: 18, height: 18, borderRadius: '50%', background: '#fff',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.15)', transition: 'left 0.25s',
                  }}
                />
              </span>
            </label>
            {completedProjects.length > 0 && (
              <button
                className="ac-subnav-btn"
                style={{ fontSize: 12 }}
                onClick={() => setShowCompletedList((v) => !v)}
              >
                {showCompletedList ? '收起' : '📋'} 已完成 ({completedProjects.length})
              </button>
            )}
          </div>

          {/* Active projects */}
          <div className="project-list">
            {activeProjects.map((project) => {
              const totalStages = project.stages.length;
              const doneStages = project.stages.filter((s) => s.completed).length;
              const pct = totalStages > 0 ? Math.round((doneStages / totalStages) * 100) : 0;

              return (
                <div key={project.id} className={`project-card ${project.completed ? 'completed' : ''}`}>
                  <div className="project-card-header">
                    <div>
                      <div className="project-name">{project.name}</div>
                      {project.description && <div className="project-desc">{project.description}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <button
                        className="tips-action-btn"
                        title={project.completed ? '标记为未完成' : '标记为已完成'}
                        onClick={() => handleToggleProjectComplete(project.id)}
                      >
                        {project.completed ? '↩' : '✅'}
                      </button>
                      <button className="tips-action-btn" onClick={() => handleDeleteProject(project.id)}>🗑</button>
                    </div>
                  </div>

                  {/* Progress */}
                  {totalStages > 0 && (
                    <div className="checkin-progress" style={{ marginBottom: 10 }}>
                      <div className="checkin-progress-text">进度：{doneStages}/{totalStages} 阶段</div>
                      <div className="checkin-progress-bar">
                        <div className="checkin-progress-fill" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )}

                  {/* Stages */}
                  <div className="stage-list">
                    {project.stages.map((stage) => (
                      <div key={stage.id} className={`stage-item ${stage.completed ? 'done' : ''}`}>
                        <div
                          className={`task-checkbox ${stage.completed ? 'checked' : ''}`}
                          onClick={() => handleToggleStage(project.id, stage.id)}
                        >
                          {stage.completed ? '✓' : ''}
                        </div>
                        <span className={`stage-name ${stage.completed ? 'done-text' : ''}`}>{stage.name}</span>
                        <div style={{ display: 'flex', gap: 2, marginLeft: 'auto' }}>
                          <button className="stage-arrow-btn" onClick={() => handleMoveStage(project.id, stage.id, 'up')}>▲</button>
                          <button className="stage-arrow-btn" onClick={() => handleMoveStage(project.id, stage.id, 'down')}>▼</button>
                          <button className="tips-action-btn" onClick={() => handleDeleteStage(project.id, stage.id)}>✕</button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Add stage */}
                  <div className={`stage-add ${editingProjectId === project.id ? 'open' : ''}`}>
                    {editingProjectId === project.id ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input
                          className="arm-input"
                          type="text"
                          placeholder="新阶段名称..."
                          value={stageName}
                          onChange={(e) => setStageName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleAddStage(project.id)}
                          autoFocus
                          style={{ flex: 1 }}
                        />
                        <button className="tips-add-btn" onClick={() => handleAddStage(project.id)}>添加</button>
                        <button className="tips-action-btn" onClick={() => setEditingProjectId(null)}>取消</button>
                      </div>
                    ) : (
                      <button className="stage-add-btn" onClick={() => { setEditingProjectId(project.id); setStageName(''); }}>
                        + 添加阶段
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Completed projects */}
          {!hideCompleted && showCompletedList && completedProjects.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div className="task-section-title" style={{ marginBottom: 10 }}>✅ 已完成的工程</div>
              <div className="project-list">
                {completedProjects.map((project) => {
                  const totalStages = project.stages.length;
                  const doneStages = project.stages.filter((s) => s.completed).length;

                  return (
                    <div key={project.id} className="project-card completed">
                      <div className="project-card-header">
                        <div>
                          <div className="project-name" style={{ textDecoration: 'line-through', opacity: 0.7 }}>
                            {project.name}
                          </div>
                          {project.description && <div className="project-desc" style={{ opacity: 0.5 }}>{project.description}</div>}
                        </div>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <button
                            className="tips-action-btn"
                            title="标记为未完成"
                            onClick={() => handleToggleProjectComplete(project.id)}
                          >↩</button>
                          <button className="tips-action-btn" onClick={() => handleDeleteProject(project.id)}>🗑</button>
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                        完成于 {project.completedAt ? new Date(project.completedAt).toLocaleDateString('zh-CN') : ''}
                      </div>
                      {totalStages > 0 && (
                        <div className="checkin-progress" style={{ marginBottom: 8 }}>
                          <div className="checkin-progress-text">进度：{doneStages}/{totalStages} 阶段</div>
                          <div className="checkin-progress-bar">
                            <div className="checkin-progress-fill" style={{ width: `${Math.round((doneStages / totalStages) * 100)}%` }} />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
