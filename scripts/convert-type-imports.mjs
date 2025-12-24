import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import ts from 'typescript';

const repoRoot = process.cwd();
const tsconfigPath = path.join(repoRoot, 'tsconfig.json');

function readTsConfig(configPath) {
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) {
    const message = ts.formatDiagnosticsWithColorAndContext([configFile.error], {
      getCanonicalFileName: (f) => f,
      getCurrentDirectory: ts.sys.getCurrentDirectory,
      getNewLine: () => ts.sys.newLine,
    });
    throw new Error(message);
  }

  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(configPath),
    undefined,
    configPath
  );

  if (parsed.errors?.length) {
    const message = ts.formatDiagnosticsWithColorAndContext(parsed.errors, {
      getCanonicalFileName: (f) => f,
      getCurrentDirectory: ts.sys.getCurrentDirectory,
      getNewLine: () => ts.sys.newLine,
    });
    throw new Error(message);
  }

  return parsed;
}

function resolveSymbol(checker, symbol) {
  if (!symbol) return undefined;
  if (symbol.flags & ts.SymbolFlags.Alias) {
    return checker.getAliasedSymbol(symbol);
  }
  return symbol;
}

function isTypeOnlyUsage(identifier) {
  for (let node = identifier; node; node = node.parent) {
    if (ts.isTypeQueryNode(node)) return false;
    if (ts.isExpressionWithTypeArguments(node) && ts.isHeritageClause(node.parent))
      return true;
    if (ts.isTypeNode(node)) return true;
    if (ts.isJSDocTypeExpression(node)) return true;
    if (ts.isStatement(node) || ts.isSourceFile(node)) break;
  }
  return false;
}

function buildImportStatement({
  typeOnly,
  defaultName,
  namespaceName,
  namedSpecifiers,
  moduleText,
}) {
  const parts = [];
  if (defaultName) parts.push(defaultName);
  if (namespaceName) parts.push(`* as ${namespaceName}`);
  if (namedSpecifiers?.length) parts.push(`{ ${namedSpecifiers.join(', ')} }`);

  const clause = parts.join(', ');
  if (!clause) return null;
  return `import${typeOnly ? ' type' : ''} ${clause} from ${moduleText};`;
}

function stripInlineTypeModifier(specifierText) {
  return specifierText.replace(/^type\s+/, '');
}

function convertFile(program, filePath) {
  const sourceFile = program.getSourceFile(filePath);
  if (!sourceFile) return { changed: false };

  const checker = program.getTypeChecker();
  const fullText = sourceFile.getFullText();
  const newLine = fullText.includes('\r\n') ? '\r\n' : '\n';

  /** @type {Array<{start:number,end:number,text:string}>} */
  const edits = [];

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (!statement.importClause) continue; // side-effect import
    if (statement.importClause.isTypeOnly) continue;

    const moduleText = fullText.slice(
      statement.moduleSpecifier.getStart(sourceFile),
      statement.moduleSpecifier.getEnd()
    );

    const defaultName = statement.importClause.name?.getText(sourceFile);

    let namespaceName;
    /** @type {ts.ImportSpecifier[]} */
    let importSpecifiers = [];

    const namedBindings = statement.importClause.namedBindings;
    if (namedBindings) {
      if (ts.isNamespaceImport(namedBindings)) {
        namespaceName = namedBindings.name.getText(sourceFile);
      } else if (ts.isNamedImports(namedBindings)) {
        importSpecifiers = namedBindings.elements;
      }
    }

    const importSymbols = new Map();

    if (statement.importClause.name) {
      const sym = resolveSymbol(
        checker,
        checker.getSymbolAtLocation(statement.importClause.name)
      );
      if (sym) importSymbols.set(defaultName, { symbol: sym, kind: 'default' });
    }

    if (namespaceName) {
      const sym = resolveSymbol(
        checker,
        checker.getSymbolAtLocation(namedBindings.name)
      );
      if (sym) importSymbols.set(namespaceName, { symbol: sym, kind: 'namespace' });
    }

    const specifierTexts = new Map();
    for (const specifier of importSpecifiers) {
      const nameText = specifier.name.getText(sourceFile);
      const sym = resolveSymbol(checker, checker.getSymbolAtLocation(specifier.name));
      if (!sym) continue;
      importSymbols.set(nameText, { symbol: sym, kind: 'named', node: specifier });
      specifierTexts.set(
        nameText,
        fullText.slice(specifier.getStart(sourceFile), specifier.getEnd())
      );
    }

    /** @type {Map<string, boolean>} */
    const isTypeOnly = new Map(Array.from(importSymbols.keys(), (k) => [k, true]));

    function visit(node) {
      if (ts.isIdentifier(node)) {
        const text = node.getText(sourceFile);
        const imported = importSymbols.get(text);
        if (imported) {
          let symHere = checker.getSymbolAtLocation(node);
          if (
            ts.isShorthandPropertyAssignment(node.parent) &&
            node.parent.name === node &&
            typeof checker.getShorthandAssignmentValueSymbol === 'function'
          ) {
            symHere = checker.getShorthandAssignmentValueSymbol(node.parent) ?? symHere;
          }
          symHere = resolveSymbol(checker, symHere);
          if (symHere && symHere === imported.symbol) {
            if (!isTypeOnlyUsage(node)) isTypeOnly.set(text, false);
          }
        }
      }
      ts.forEachChild(node, visit);
    }

    for (const topStatement of sourceFile.statements) {
      if (ts.isImportDeclaration(topStatement)) continue;
      visit(topStatement);
    }

    const defaultIsTypeOnly =
      defaultName && isTypeOnly.get(defaultName) === true ? defaultName : undefined;
    const defaultIsValue =
      defaultName && isTypeOnly.get(defaultName) === false ? defaultName : undefined;

    const namespaceIsTypeOnly =
      namespaceName && isTypeOnly.get(namespaceName) === true ? namespaceName : undefined;
    const namespaceIsValue =
      namespaceName && isTypeOnly.get(namespaceName) === false ? namespaceName : undefined;

    const namedTypeOnly = [];
    const namedValue = [];
    for (const [name, text] of specifierTexts.entries()) {
      if (isTypeOnly.get(name) === true) namedTypeOnly.push(stripInlineTypeModifier(text));
      else namedValue.push(text);
    }

    const allTypeOnly =
      (defaultName ? defaultIsTypeOnly : true) &&
      (namespaceName ? namespaceIsTypeOnly : true) &&
      namedValue.length === 0;

    if (allTypeOnly) {
      const rebuilt = buildImportStatement({
        typeOnly: true,
        defaultName: defaultIsTypeOnly,
        namespaceName: namespaceIsTypeOnly,
        namedSpecifiers: namedTypeOnly.length ? namedTypeOnly : undefined,
        moduleText,
      });
      if (!rebuilt) continue;

      const start = statement.getStart(sourceFile);
      const end = statement.getEnd();
      const original = fullText.slice(start, end);
      if (rebuilt !== original) edits.push({ start, end, text: rebuilt });
      continue;
    }

    const typeStatement = buildImportStatement({
      typeOnly: true,
      defaultName: defaultIsTypeOnly,
      namespaceName: namespaceIsTypeOnly,
      namedSpecifiers: namedTypeOnly.length ? namedTypeOnly : undefined,
      moduleText,
    });

    const valueStatement = buildImportStatement({
      typeOnly: false,
      defaultName: defaultIsValue,
      namespaceName: namespaceIsValue,
      namedSpecifiers: namedValue.length ? namedValue : undefined,
      moduleText,
    });

    if (!typeStatement) continue;
    if (!valueStatement) continue;

    const start = statement.getStart(sourceFile);
    const end = statement.getEnd();
    const replacement = `${valueStatement}${newLine}${typeStatement}`;
    edits.push({ start, end, text: replacement });
  }

  if (!edits.length) return { changed: false };

  edits.sort((a, b) => b.start - a.start);
  let out = fullText;
  for (const edit of edits) {
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  }

  if (out !== fullText) {
    fs.writeFileSync(filePath, out, 'utf8');
    return { changed: true, editCount: edits.length };
  }
  return { changed: false };
}

function main() {
  const parsed = readTsConfig(tsconfigPath);
  const fileNames = parsed.fileNames.filter((f) => {
    const rel = path.relative(repoRoot, f);
    if (rel.startsWith('..')) return false;
    if (!rel.startsWith('projects' + path.sep)) return false;
    return rel.endsWith('.ts') || rel.endsWith('.tsx');
  });

  const program = ts.createProgram({
    rootNames: fileNames,
    options: parsed.options,
    projectReferences: parsed.projectReferences,
  });

  let changedFiles = 0;
  let totalEdits = 0;
  for (const filePath of fileNames) {
    const result = convertFile(program, filePath);
    if (result.changed) {
      changedFiles += 1;
      totalEdits += result.editCount ?? 0;
    }
  }

  console.log(`Updated ${changedFiles} files (${totalEdits} import edits).`);
}

main();
