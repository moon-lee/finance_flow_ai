import { css, unsafeCSS } from 'lit';
import tokenCss from './token.css?raw';
import layoutCss from './layout.css?raw';

export const sharedStyles = css`${unsafeCSS(tokenCss)}${unsafeCSS(layoutCss)}`;
