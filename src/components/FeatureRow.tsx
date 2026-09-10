import { useState, type ReactNode } from 'react';

interface Props {
  title: string;
  desc?: string;      // 功能简介：默认折叠，点功能名展开
  children?: ReactNode;
}

// 个人中心 / 权限设置的功能行：左侧功能名（可点开简介），右侧控件
export default function FeatureRow({ title, desc, children }: Props) {
  const [open, setOpen] = useState(false);
  const canExpand = !!desc;
  return (
    <div className="pf-block">
      <div className="pf-row">
        <span
          className={`pf-row-title ${canExpand ? 'expandable' : ''}`}
          onClick={() => canExpand && setOpen(!open)}
        >
          {title}
          {canExpand && <i className={`pf-caret ${open ? 'open' : ''}`}>›</i>}
        </span>
        <span className="pf-row-ctrl">{children}</span>
      </div>
      {open && desc && <div className="pf-desc">{desc}</div>}
    </div>
  );
}

// 单按钮开关：点一下点亮（开），再点一下关闭
export function ToggleButton({
  on,
  onToggle,
  disabled,
}: {
  on: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className={`pf-toggle ${on ? 'on' : ''}`}
      disabled={disabled}
      onClick={onToggle}
    >
      {on ? '已开启' : '已关闭'}
    </button>
  );
}
