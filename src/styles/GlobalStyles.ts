import { createGlobalStyle } from 'styled-components'

export const GlobalStyles = createGlobalStyle`
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  html, body, #root {
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #0e0e0e;
    color: #e5e5e5;
    font-family: 'Inter', sans-serif;
  }

  ::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }

  ::-webkit-scrollbar-track {
    background: #161616;
  }

  ::-webkit-scrollbar-thumb {
    background: #2a2a2a;
    border-radius: 3px;
  }

  input[type='range'] {
    -webkit-appearance: none;
    appearance: none;
    background: transparent;
    cursor: pointer;
    height: 20px;
  }

  input[type='range']::-webkit-slider-runnable-track {
    height: 4px;
    background: #2a2a2a;
    border-radius: 2px;
  }

  input[type='range']::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #f97316;
    margin-top: -5px;
    border: 2px solid #0e0e0e;
  }
`
