import { css } from 'lit';

export const baseViewStyles = css`
  :host {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #1e1e1e;
    color: #d4d4d4;
    font-size: 14px;
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
    font-size: 20px;
    font-weight: 600;
    color: #ffffff;
    margin: 0;
  }

  .btn {
    background: #0e639c;
    color: #ffffff;
    border: none;
    padding: 8px 16px;
    border-radius: 3px;
    font-size: 13px;
    cursor: pointer;
    font-family: inherit;
  }

  .btn:hover {
    background: #1177bb;
  }

  .btn-secondary {
    background: #3c3c3c;
    color: #d4d4d4;
    border: 1px solid #3e3e3e;
  }

  .btn-secondary:hover {
    border-color: #007acc;
  }

  .btn-danger {
    background: transparent;
    color: #f48771;
    border: 1px solid #f48771;
  }

  .btn-danger:hover {
    background: #f48771;
    color: #1e1e1e;
  }

  .empty-state {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: #858585;
    text-align: center;
    gap: 12px;
  }

  .empty-state h3 {
    font-size: 16px;
    font-weight: 600;
    color: #d4d4d4;
    margin: 0;
  }

  .empty-state p {
    font-size: 13px;
    margin: 0;
    max-width: 360px;
  }

  .error {
    color: #f48771;
    font-size: 13px;
    margin-top: 8px;
  }
`;

export const headerHighlightStyles = css`
  .header {
    padding-left: 12px;
    border-left: 3px solid rgba(99, 102, 241, 0.35);
  }
`;
