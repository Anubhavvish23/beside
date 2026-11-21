(() => {
  if (window.__beside_main) return;
  window.__beside_main = true;

  let last_focused = null;
  document.addEventListener('focusin', (event) => {
    last_focused = event.target;
  }, true);

  function indent_of(line) {
    return (line.match(/^\s*/) || [''])[0];
  }

  function plan_insert(current_line, text) {
    const clean = text.replace(/\r/g, '').split('\n')[0];
    if (!current_line.trim()) {
      const line_text = /^\s/.test(clean) ? clean : `${current_line}${clean.trim()}`;
      return { replace_current: true, line_text };
    }
    if (/^\s/.test(clean)) return { replace_current: false, line_text: clean };
    const extra = /[:{]\s*$/.test(current_line) ? '    ' : '';
    return { replace_current: false, line_text: `${indent_of(current_line)}${extra}${clean.trim()}` };
  }

  function owns_focus(root) {
    return Boolean(last_focused && root && root.contains(last_focused));
  }

  function monaco_adapter() {
    const monaco = window.monaco;
    if (!monaco || !monaco.editor || !monaco.editor.getEditors) return null;
    const editors = monaco.editor.getEditors().filter((editor) => editor.getModel());
    if (!editors.length) return null;
    const editor =
      editors.find((item) => item.hasTextFocus && item.hasTextFocus()) ||
      editors.find((item) => owns_focus(item.getDomNode())) ||
      editors.sort((a, b) => b.getModel().getValueLength() - a.getModel().getValueLength())[0];
    return {
      kind: 'Monaco',
      read() {
        const model = editor.getModel();
        return {
          code: model.getValue(),
          cursor_line: (editor.getPosition() || { lineNumber: 1 }).lineNumber,
          language: model.getLanguageId ? model.getLanguageId() : '',
        };
      },
      insert(text) {
        const model = editor.getModel();
        const line = (editor.getPosition() || { lineNumber: model.getLineCount() }).lineNumber;
        const current = model.getLineContent(line);
        const plan = plan_insert(current, text);
        const end = model.getLineMaxColumn(line);
        const range = plan.replace_current
          ? new monaco.Range(line, 1, line, end)
          : new monaco.Range(line, end, line, end);
        const value = plan.replace_current ? plan.line_text : `\n${plan.line_text}`;
        editor.executeEdits('beside', [{ range, text: value, forceMoveMarkers: true }]);
        const target = plan.replace_current ? line : line + 1;
        editor.setPosition({ lineNumber: target, column: model.getLineMaxColumn(target) });
        editor.focus();
        return true;
      },
    };
  }

  function cm6_view(root) {
    const content = root.querySelector('.cm-content');
    const holder = content && content.cmView;
    if (!holder) return null;
    return holder.view || (holder.rootView && holder.rootView.view) || null;
  }

  function cm6_adapter() {
    const roots = [...document.querySelectorAll('.cm-editor')];
    if (!roots.length) return null;
    const root = roots.find(owns_focus) || roots.sort((a, b) => b.textContent.length - a.textContent.length)[0];
    const view = cm6_view(root);
    if (!view) {
      return {
        kind: 'CodeMirror',
        read() {
          const lines = [...root.querySelectorAll('.cm-line')].map((line) => line.textContent);
          return { code: lines.join('\n'), cursor_line: lines.length, language: '' };
        },
        insert() {
          return false;
        },
      };
    }
    return {
      kind: 'CodeMirror',
      read() {
        const state = view.state;
        return {
          code: state.doc.toString(),
          cursor_line: state.doc.lineAt(state.selection.main.head).number,
          language: '',
        };
      },
      insert(text) {
        const state = view.state;
        const line = state.doc.lineAt(state.selection.main.head);
        const plan = plan_insert(line.text, text);
        const changes = plan.replace_current
          ? { from: line.from, to: line.to, insert: plan.line_text }
          : { from: line.to, insert: `\n${plan.line_text}` };
        const anchor = plan.replace_current ? line.from + plan.line_text.length : line.to + 1 + plan.line_text.length;
        view.dispatch({ changes, selection: { anchor } });
        view.focus();
        return true;
      },
    };
  }

  function cm5_adapter() {
    const roots = [...document.querySelectorAll('.CodeMirror')].filter((root) => root.CodeMirror);
    if (!roots.length) return null;
    const cm = (roots.find(owns_focus) || roots[0]).CodeMirror;
    return {
      kind: 'CodeMirror',
      read() {
        return { code: cm.getValue(), cursor_line: cm.getCursor().line + 1, language: (cm.getOption('mode') || '').toString() };
      },
      insert(text) {
        const line = cm.getCursor().line;
        const current = cm.getLine(line);
        const plan = plan_insert(current, text);
        if (plan.replace_current) {
          cm.replaceRange(plan.line_text, { line, ch: 0 }, { line, ch: current.length });
          cm.setCursor({ line, ch: plan.line_text.length });
        } else {
          cm.replaceRange(`\n${plan.line_text}`, { line, ch: current.length });
          cm.setCursor({ line: line + 1, ch: plan.line_text.length });
        }
        cm.focus();
        return true;
      },
    };
  }

  function ace_adapter() {
    const roots = [...document.querySelectorAll('.ace_editor')];
    if (!roots.length) return null;
    const root = roots.find(owns_focus) || roots[0];
    const editor = (root.env && root.env.editor) || (window.ace && window.ace.edit && window.ace.edit(root));
    if (!editor) return null;
    return {
      kind: 'Ace',
      read() {
        const mode = editor.session.getMode && editor.session.getMode().$id;
        return { code: editor.getValue(), cursor_line: editor.getCursorPosition().row + 1, language: mode || '' };
      },
      insert(text) {
        const row = editor.getCursorPosition().row;
        const current = editor.session.getLine(row);
        const plan = plan_insert(current, text);
        if (plan.replace_current) {
          editor.session.insert({ row, column: current.length }, plan.line_text.slice(current.length));
          editor.moveCursorTo(row, plan.line_text.length);
        } else {
          editor.session.insert({ row, column: current.length }, `\n${plan.line_text}`);
          editor.moveCursorTo(row + 1, plan.line_text.length);
        }
        editor.focus();
        return true;
      },
    };
  }

  function textarea_adapter() {
    const candidates = [...document.querySelectorAll('textarea')].filter((item) => item.offsetHeight > 60);
    const focused = last_focused && last_focused.tagName === 'TEXTAREA' ? last_focused : null;
    const area = focused || candidates.sort((a, b) => b.offsetHeight * b.offsetWidth - a.offsetHeight * a.offsetWidth)[0];
    if (!area) return null;
    return {
      kind: 'Text box',
      read() {
        return { code: area.value, cursor_line: area.value.slice(0, area.selectionStart).split('\n').length, language: '' };
      },
      insert(text) {
        const value = area.value;
        const line_start = value.lastIndexOf('\n', area.selectionStart - 1) + 1;
        let line_end = value.indexOf('\n', area.selectionStart);
        if (line_end < 0) line_end = value.length;
        const plan = plan_insert(value.slice(line_start, line_end), text);
        area.focus();
        if (plan.replace_current) {
          area.setRangeText(plan.line_text, line_start, line_end, 'end');
        } else {
          area.setRangeText(`\n${plan.line_text}`, line_end, line_end, 'end');
        }
        area.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      },
    };
  }

  function editable_adapter() {
    const element =
      last_focused && last_focused.isContentEditable
        ? last_focused.closest('[contenteditable="true"], [contenteditable=""]') || last_focused
        : null;
    if (!element) return null;
    return {
      kind: 'Editor',
      read() {
        return { code: element.innerText, cursor_line: 0, language: '' };
      },
      insert(text) {
        element.focus();
        return document.execCommand('insertText', false, `\n${text.trim()}`);
      },
    };
  }

  function find_adapter() {
    const adapters = [monaco_adapter, cm6_adapter, cm5_adapter, ace_adapter, textarea_adapter, editable_adapter];
    let fallback = null;
    for (const make of adapters) {
      try {
        const adapter = make();
        if (!adapter) continue;
        if (!fallback) fallback = adapter;
      } catch {}
    }
    return fallback;
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || !event.data.beside_req) return;
    const { beside_req, type, data } = event.data;
    let result = { ok: false, error: 'no_editor' };
    try {
      const adapter = find_adapter();
      if (adapter && type === 'read') {
        result = { ok: true, kind: adapter.kind, ...adapter.read() };
      } else if (adapter && type === 'insert') {
        result = { ok: Boolean(adapter.insert(String((data && data.text) || ''))), kind: adapter.kind };
      }
    } catch (error) {
      result = { ok: false, error: String(error && error.message ? error.message : error) };
    }
    window.postMessage({ beside_reply: beside_req, result }, '*');
  });
})();
