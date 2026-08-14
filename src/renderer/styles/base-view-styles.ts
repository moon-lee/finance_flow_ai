import { css } from 'lit';

export const baseViewStyles = css`
  :host {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: var(--workspace-bg);
    color: var(--text-secondary);
    font-size: 15px;
    line-height: 1.5;
    padding: 24px;
    box-sizing: border-box;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
    min-width: 0;
  }

  .header h1 {
      font-size: 21px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }

  .btn {
    background: var(--btn-primary-bg);
    color: var(--btn-primary-text);
    border: none;
    padding: 8px 16px;
    border-radius: 3px;
      font-size: 12px;
    cursor: pointer;
    font-family: inherit;
  }

  .btn:hover {
    background: var(--btn-primary-hover-bg);
  }

  .btn-secondary {
    background: var(--btn-secondary-bg);
    color: var(--btn-secondary-text);
    border: 1px solid var(--btn-secondary-border);
  }

  .btn-secondary:hover {
    border-color: var(--btn-secondary-hover-border);
  }

  .btn-danger {
    background: transparent;
    color: var(--danger-color);
    border: 1px solid var(--danger-border);
  }

  .btn-danger:hover {
    background: var(--danger-hover-bg);
    color: var(--danger-hover-text);
  }

  .empty-state {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: var(--text-tertiary);
    text-align: center;
    gap: 12px;
  }

  .empty-state h3 {
      font-size: 17px;
    font-weight: 600;
    color: var(--text-secondary);
    margin: 0;
  }

  .empty-state p {
    font-size: 14px;
    margin: 0;
    max-width: 360px;
  }

  .error {
    color: var(--danger-color);
    font-size: 14px;
    margin-top: 8px;
  }
`;

export const headerHighlightStyles = css`
  .header {
    padding-left: 12px;
    border-left: 3px solid rgba(99, 102, 241, 0.35);
  }
`;
