// Partially based on cashew asm.js parser (see Upstream/cashew/LICENSE)

'use strict';

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define(['exports'], factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports);
  } else {
    factory((root.asmParse = {}));
  }
}(this, function (exports) {
  var tokenizer       = require("./asm-tokenizer.js");
  var expressionChain = require("./asm-expressionchain.js");
  var treeBuilder     = require("./json-treebuilder.js");

  var Tokenizer       = tokenizer.Tokenizer;
  var JsonTreeBuilder = treeBuilder.JSON;
  var ExpressionChain = expressionChain.ExpressionChain;


  var TraceTokenization       = true;
  var TraceParsingStack       = false;
  var TraceRewind             = false;
  var TraceOperatorPrecedence = false;


  function Parser (tokenizer, treeBuilder) {
    this.tokenizer = tokenizer;
    this.builder = treeBuilder;
    this._rewound = null;

    // HACK: GROSS.
    // Replace with some sort of pervasive 'parsing context' argument that
    //  can be overridden when parsing certain subtrees?
    this._forInStack = [];

    if (TraceParsingStack)
      this.previousStackFrames = [];
  };

  Parser.prototype.getIndentChars = function (n) {
    var indentChars = "";

    for (var i = 0; i < n - 1; i++)
      indentChars += "..";

    if (n)
      indentChars += "  ";

    return indentChars;
  };

  Parser.prototype.getStack = function () {
    Error.stackTraceLimit = 256;

    var r = /at ([A-Za-z0-9$_\.]*) /g;
    var e = new Error();
    var stack = e.stack;
    var stackFrames = [], frame = null;

    while ((frame = r.exec(stack)) !== null) {
      frame = frame[1];
      if (frame.indexOf("Parser.") !== 0)
        continue;
      else if (frame.indexOf(".readToken") >= 0)
        continue;
      else if (frame.indexOf(".expectToken") >= 0)
        continue;
      else if (frame.indexOf(".getStack") >= 0)
        continue;
      else if (frame.indexOf(".rewind") >= 0)
        continue;

      stackFrames.push(frame);
    }

    stackFrames.reverse();  
    return stackFrames;
  };

  Parser.prototype.readToken = function () {
    var result;

    var indentLevel = 0;
    if (TraceParsingStack) {
      var stackFrames = this.getStack();
      var newSubframes = false;

      for (var i = 0, l = Math.max(stackFrames.length, this.previousStackFrames.length); i < l; i++) {
        var previousFrame = this.previousStackFrames[i];
        var frame = stackFrames[i];

        if (previousFrame === frame)
          continue;

        if (!previousFrame)
          console.log(this.getIndentChars(i) + frame + " {");
        else if (previousFrame && !frame) {
          console.log(this.getIndentChars(i) + "} // " + previousFrame);
          break;
        } else {
          var ic = this.getIndentChars(i);
          if (!newSubframes)
            console.log(ic + "} // " + previousFrame);

          console.log(ic + frame + " {");
          newSubframes = true;
        }
      }

      this.previousStackFrames = stackFrames;
      indentLevel = stackFrames.length;
    }

    if (this._rewound) {
      result = this._rewound;
      this._rewound = null;

      if (TraceTokenization)
        console.log(this.getIndentChars(indentLevel) + "(rewound " + JSON.stringify(result.value) + ")");
    } else {
      result = this.tokenizer.read();

      if (TraceTokenization)
        console.log(this.getIndentChars(indentLevel) + result.type, JSON.stringify(result.value));
    }

    return result;
  };

  Parser.prototype.rewind = function (token) {
    if (arguments.length !== 1)
      throw new Error("Expected token");

    if (this._rewound && (this._rewound !== token)) {
      throw new Error("Already rewound");
    } else {
      if (TraceRewind) {
        var stack = this.getStack();
        console.log("Rewound token " + JSON.stringify(token) + " at " + stack[stack.length - 1]);
      }
      this._rewound = token;
    }
  };

  Parser.prototype.expectToken = function (type, value) {
    var token = this.readToken();
    if (token.type === type) {
      if ((arguments.length === 2) && (token.value !== value)) {
        return this.abort("Expected a '" + type + "' with value '" + value + "', got '" + token.value + "'");
      } else {
        return token.value;
      }
    }

    return this.abort("Expected a token of type '" + type + "', got '" + token.type + "'.");
  };

  Parser.prototype.abort = function () {
    console.log.apply(console, arguments);
    throw new Error(arguments[0] || "Aborted");
  };

  Parser.prototype.parseTopLevel = function () {
    var result = this.builder.makeTopLevelBlock();

    this.parseBlockInterior(result);

    return result;
  };

  // parses the interior of a multi-statement block (i.e. the { has been consumed)
  // aborts at eof or uneven } (end of multi-statement block)
  Parser.prototype.parseBlockInterior = function (block) {
    if (!block || !block.statements)
      return this.abort("Expected a block argument");

    while (true) {
      var stmt = this.parseStatement(block);

      if (stmt === false)
        break;

      // console.log("Statement", stmt);
      this.builder.appendToBlock(block, stmt);
    }
  };

  Parser.prototype.parseReturnStatement = function () {
    var result = this.parseExpression("statement-argument");

    if (result === false)
      result = null;

    return this.builder.makeReturnStatement(result);
  };

  Parser.prototype.parseThrowStatement = function () {
    var expression = this.parseExpression("statement-argument");
    if (!expression)
      return this.abort("Expected argument after 'throw'");

    return this.builder.makeThrowStatement(expression);
  };

  Parser.prototype.parseIfStatement = function () {
    this.expectToken("separator", "(");

    var cond = this.parseExpression("subexpression");

    var trueStatement = this.parseStatement(), falseStatement = null;

    var maybeElse = this.readToken();
    if (
      (maybeElse.type === "keyword") &&
      (maybeElse.value === "else")
    ) {
      falseStatement = this.parseStatement();
    } else {
      this.rewind(maybeElse);
    }

    return this.builder.makeIfStatement(cond, trueStatement, falseStatement);
  };

  Parser.prototype.parseForStatement = function () {
    this.expectToken("separator", "(");

    this._forInStack.push(false);

    var init = this.parseExpression("for-expression");

    var wasForIn = this._forInStack.pop();

    if (wasForIn) {
      // for (a in b) { ... }
      var body = this.parseStatement();

      return this.builder.makeForInStatement(init, body);
    } else {
      // for (a;b;c) { ... }
      var update = this.parseExpression("for-expression");
      var terminate = this.parseExpression("for-expression");

      var body = this.parseStatement();

      return this.builder.makeForStatement(init, update, terminate, body);
    }
  };

  Parser.prototype.parseDeclarationStatement = function () {
    var declarations = [], token = null;

    var abort = false;
    function aborter (token) {
      if (token === ";")
        abort = true; 
    }

    while ((token = this.readToken()) !== false) {
      if (token.type === "identifier") {
        var variableName = token.value;
        token = this.readToken();

        if (token.type === "operator") {
          if (token.value === "=") {
            // Initializer
            var initializer = this.parseExpression("declaration", aborter);
            declarations.push([variableName, initializer]);

            if (abort)
              break;
          } else if (token.value === ",") {
            // No initializer
            declarations.push([variableName]);
          } else if (token.value === "in") {
            // FIXME: Reject this outside any non-for-loop context
            if (declarations.length !== 0) {
              return this.abort("Found 'in' operator in declaration statement after a declaration");
            } else {
              return this.parseForInDeclaration(variableName);
            }
          } else {
            return this.abort("Unexpected operator in declaration statement: " + JSON.stringify(token.value));
          }
        } else if (
          (token.type === "separator") &&
          (token.value === ";")
        ) {
          break;
        } else {
          return this.abort("Unexpected token in declaration statement: " + JSON.stringify(token.value));
        }
      } else {
        return this.abort("Unexpected token in declaration statement: " + JSON.stringify(token.value));
      }
    }

    return this.builder.makeDeclarationStatement(declarations);
  };

  Parser.prototype.parseForInDeclaration = function (variableName) {
    var sequenceExpression = this.parseExpression("for-expression");

    if (this._forInStack.length)
      this._forInStack[this._forInStack.length - 1] = true;

    return this.builder.makeForInDeclaration(variableName, sequenceExpression);
  };

  Parser.prototype.parseFunctionExpression = function () {
    var name = null;

    var token = this.readToken();
    if (token.type === "identifier") {
      name = token.value;

      this.expectToken("separator", "(");
    } else if (
      (token.type !== "separator") ||
      (token.value !== "(")
    ) {
      return this.abort("Expected a function name or an argument name list");
    }

    var argumentNames = [];

    while (
      (token = this.readToken()) && 
      (
        (token.type === "identifier") ||
        (
          (token.type === "operator") &&
          (token.value === ",")
        )
      )
    ) {

      if (token.type === "identifier")
        argumentNames.push(token.value);
      else;
        // Ignore comma
    }

    if (
      (token.type !== "separator") ||
      (token.value !== ")")
    ) {
      return this.abort("Expected an argument name list terminator or another argument name");
    }

    this.expectToken("separator", "{");

    var body = this.builder.makeBlock();
    this.parseBlockInterior(body);

    return this.builder.makeFunctionExpression(
      name, argumentNames, body
    );
  };

  // Parses complex keywords.
  // Returns false if the keyword was not handled by the parser.
  // Returns [ false, expr ] if it parsed an expression.
  // Returns [ true, stmt ] if it parsed a full statement.
  Parser.prototype.parseKeyword = function (keyword) {
    if ((arguments.length !== 1) || (!keyword))
      return this.abort("Expected a keyword");

    switch (keyword) {
      case "function":
        return [false, this.parseFunctionExpression()];

      case "if":
        return [true, this.parseIfStatement()];

      case "for":
        return [true, this.parseForStatement()];

      case "var":
      case "const":
        return [true, this.parseDeclarationStatement()];

      case "return":
        return [true, this.parseReturnStatement()];

      case "throw":
        return [true, this.parseThrowStatement()];

      default:
        return this.abort("Unhandled keyword '" + keyword + "'");
        return false;
    }
  };

  Parser.prototype.parseArrayLiteral = function () {
    var elements = [];

    var item = null, abort = false;
    function aborter () { abort = true; }

    while (
      !abort && 
      (item = this.parseExpression("array-literal", aborter)) !== false
    ) {
      elements.push(item);
    }

    return this.builder.makeArrayLiteralExpression(elements);
  };

  Parser.prototype.parseObjectLiteral = function () {
    var pairs = [];

    var abort = false;
    function aborter () { abort = true; }

    while (true) {
      var token = this.readToken();
      if (
        (token.type === "separator") &&
        (token.value === "}")
      )
        break;
      else if (token.type !== "identifier")
        return this.abort("Expected identifier or }");

      var colon = this.expectToken("operator", ":");

      var key = token.value;
      var value = this.parseExpression("object-literal", aborter);

      pairs.push([key, value]);
      if (abort)
        break;
    }

    return this.builder.makeObjectLiteralExpression(pairs);
  };

  Parser.prototype.parseInvocation = function (callee) {
    var argumentValues = [], argumentValue = null, abort = false;
    function aborter () { abort = true; }

    while (
      !abort && 
      (argumentValue = this.parseExpression("argument-list", aborter)) !== false
    ) {
      argumentValues.push(argumentValue);
    }

    return this.builder.makeInvocationExpression(
      callee, argumentValues
    );
  };


  var OptionalExpressionContexts = {
    "statement-argument": true,
    "array-literal": true,
    "object-literal": true,
    "argument-list": true
  };

  // Parses a single expression. Handles nesting.
  // terminatorCallback, if provided, can return true to 'rewind' the terminating token
  Parser.prototype.parseExpression = function (context, terminatorCallback) {
    var terminators, stopAtKeywords = false, rewindChars = "";

    var unexpected = "});";

    switch (context) {
      // Return statement.
      case "statement-argument":
        stopAtKeywords = true;
        // Fall-through

      // Free-standing expression (no surrounding parentheses).
      case "statement":
        terminators = ";}";
        rewindChars = "}";
        unexpected = ")";
        break;

      // Parenthesized expression.
      case "subexpression":
        terminators = ")";
        unexpected = ";}";
        break;

      // Single declarator in a var/const statement.
      case "declaration":
        terminators = ";},";
        rewindChars = "}";
        unexpected = ")";
        break;

      // Array subscript index.
      case "subscript":
        terminators = "]";
        unexpected = "});";
        break;

      // Part of a for (a;b;c) expression
      case "for-expression":
        terminators = ");";
        unexpected = "}";
        break;

      // Single argument within argument list.
      case "argument-list":
        terminators = "),";
        unexpected = "};";
        break;

      // Single value within array literal.
      case "array-literal":
        terminators = "],";
        unexpected = "};)";
        break;

      // Single key/value pair within object literal.
      case "object-literal":
        terminators = "},";
        unexpected = "];)";
        break;

      default:
        return this.abort("Unsupported expression context '" + context + "'");
    }

    var token = null;
    // HACK: Any non-nested expression elements are splatted onto the end of chain
    //  before being resolved in one final pass at the end. This enables us to
    //  properly handle operator precedence without having to go spelunking inside
    //  nodes constructed by the Builder.
    var chain = new ExpressionChain(this.builder, TraceOperatorPrecedence);
    // Stores the most recently constructed expression. Some tokens wrap this or modify it
    var lhs = null;

    iter:
    while (token = this.readToken()) {
      switch (token.type) {
        case "separator":
          // We handle expected terminators here, so if they get encountered below,
          //  they're probably a syntax error.
          if (terminators.indexOf(token.value) >= 0) {
            // This notifies the caller that we hit a terminator while parsing.
            // The argument lets them decide how to handle the terminator.
            // The callback is not invoked for commas, even though they can terminate.
            if (terminatorCallback) {
              if (terminatorCallback(token.value) === true)
                this.rewind(token);
            }

            // Certain terminators need to be rewinded so that they can be processed again.
            if (rewindChars.indexOf(token.value) >= 0)                
              this.rewind(token);

            break iter;
          } else if (unexpected.indexOf(token.value) >= 0) {
            return this.abort("Unexpected '" + token.value + "' in context '" + context + "'");
          }

          switch (token.value) {
            case "(":
              // Subexpression or function invocation
              // These are high-precedence and complicated so we just handle them now

              if (lhs) {
                // Function invocation
                lhs = this.parseInvocation(lhs);
              } else {
                // Subexpression
                lhs = this.parseExpression("subexpression");
              }

              break;

            case "{":
              if (lhs) {
                return this.abort("Unexpected { juxtaposed with expression");
              } else {
                lhs = this.parseObjectLiteral();
              }

              break;

            case "[":
              // Subscript expression or array literal

              if (lhs) {
                // Subscripting
                // High-precedence so we can do it here
                var index = this.parseExpression("subscript");
                lhs = this.builder.makeComputedMemberAccessExpression(lhs, index);
              } else {
                // Array literal
                lhs = this.parseArrayLiteral();
              }

              break;

            default:
              return this.abort("Unexpected '" + token.value + "' within expression");
          }

          break;

        case "operator":
          if (terminators.indexOf(token.value) >= 0) {
            if (rewindChars.indexOf(token.value) >= 0)
              this.rewind(token);

            break iter;
          } else if (unexpected.indexOf(token.value) >= 0) {
            return this.abort("Unexpected '" + token.value + "' in context '" + context + "'");
          }

          if (token.value === ",") {
            if (lhs) {
              // We could do this manually here, but it's easier to just fold the
              //  comma expression logic in with the rest of the precedence &
              //  associativity logic.
              chain.pushExpression(lhs);
              lhs = null;
              chain.pushOperator(",");

            } else {
              return this.abort("Expected expression before ,");
            }

          } else if (token.value === ".") {
            // Member access operator
            if (!lhs)
              this.abort("Expected expression before .");

            var identifier = this.expectToken("identifier");
            lhs = this.builder.makeMemberAccessExpression(lhs, identifier);

          } else {
            // Operators push expressions and themselves onto the chain
            //  so that at the end of things we can order them by precedence
            //  and apply associativity.

            if (token.value === ":") {
              if (!chain.length)
                return this.abort("Unexpected : early in expression");
            }

            if (lhs) {
              chain.pushExpression(lhs);
              lhs = null;
            }

            chain.pushOperator(token.value);
          }

          break;

        case "identifier":
          lhs = this.builder.makeIdentifierExpression(token.value);
          break;

        case "keyword":
          if (stopAtKeywords) {
            if (terminatorCallback)
              terminatorCallback(token.value);

            this.rewind(token);
            break iter;
          }

          // Attempt to parse complex keywords
          var kw = this.parseKeyword(token.value);
          if (kw === false) {
            return this.abort("Unhandled keyword '" + token.value + "' in expression");
          } else {
            if (kw[0]) {
              if (lhs || chain.length) {
                console.log(lhs);
                console.log(chain.items);
                return this.abort("Unhandled keyword statement (" + token.value + ") in the middle of an expression");
              } else {
                return kw[1];
              }
            } else {
              if (lhs) {
                console.log(lhs);
                console.log(chain.items);
                this.abort("Keyword expression following expression");
              } else {
                lhs = kw[1];
              }
            }
          }

          break;

        case "integer":
        case "double":
        case "string":
          lhs = this.builder.makeLiteralExpression(token.type, token.value);
          break;
      }
    }

    // Now we finalize the chain, and apply precedence sorting
    if (lhs) {
      chain.pushExpression(lhs);
      lhs = null;
    }

    // At this point the chain will be a stream of operators and expressions.
    // Operators are raw string literals, expressions are objects (from the builder).
    // We don't need to know anything about the expressions, just know that they 
    //  aren't operators (i.e. not strings) so we can wrap them in other expression
    //  types.

    if (!chain.length) {
      // In some contexts the expression being parsed is optional, so we don't fail.
      if (OptionalExpressionContexts[context] === true)
        return false;
      else
        return this.abort("No expression parsed in context " + context);
    }

    // The common case is going to be a chain containing exactly one expression.
    // No work to be done there!
    if (chain.length > 1) {
      // The right solution here is probably a modified version of the shunting-yard
      //  algorithm, but it would need a handful of modifications to handle JS's oddball
      //  operators, so I'm going with slow-but-correct here.
      chain.applyDecrementAndIncrement();
      chain.applyUnaryOperators();
      chain.applyBinaryOperators();
      chain.applyTernaryOperator();
      chain.applyAssignmentOperators();
    }

    if (chain.length === 1)
      return chain.at(0);
    else {
      console.log("chain", chain.items);
      return this.abort("Left with more than one result after expression resolution");
    }
  };

  // parses a single statement, returns false if it hit a block-closing token.
  // handles nested blocks.
  Parser.prototype.parseStatement = function (block) {
    var token = null, stmt = null, expr = null;

    iter:
    while (token = this.readToken()) {
      switch (token.type) {
        case "keyword":
          var kwOrExpr = this.parseKeyword(token.value);
          if (kwOrExpr !== false) {
            expr = kwOrExpr[1];
            break iter;
          } else {
            break;
          }

        case "separator":
          switch (token.value) {
            case "{":
              // Read nested block scope. Meaningless, but important to parse
              //  correctly.
              // FIXME: How do we distinguish between a free-standing object literal,
              //  and a block scope?
              var childBlock = this.builder.makeBlock();
              stmt = this.builder.makeBlockStatement(childBlock);

              this.parseBlockInterior(childBlock);

              return stmt;

            case "}":
              return false;

            case ";":
              // HACK: Just skip stray semicolons. We don't care about
              //  no-op statements, and this lets us avoid conditionally
              //  eating a trailing ;.
              continue iter;

            default:
              // Fall-through
          }

        default:
          this.rewind(token);
          expr = this.parseExpression("statement");
          break iter;

      }
    }

    if (expr) {
      if (expr.type.indexOf("Statement"))
        // HACK: If parsing produced a statement instead of an expression,
        //  just use it
        return expr;
      else if (expr.type === "Function")
        // HACK: If parsing produced a free-standing function expression,
        //  convert it to a function statement
        return this.builder.makeFunctionStatement(expr);
      else
        return this.builder.makeExpressionStatement(expr);
    }

    return false;
  };


  // parses an input character stream into a tree of asm.js AST nodes
  // input is a ByteReader (see encoding.js)
  // treebuilder is an object that implements the abstract TreeBuilder interface
  function parse (input, treeBuilder) {
    var tokenizer = new Tokenizer(input);
    var parser    = new Parser(tokenizer, treeBuilder);

    try {
      return parser.parseTopLevel();
    } catch (exc) {
      console.log("Error occurred at offset " + tokenizer.getPosition());
      console.log("Most recent token was", tokenizer.getPrevious());
      throw exc;
    }
  };


  exports.JsonTreeBuilder = JsonTreeBuilder;
  exports.Tokenizer       = Tokenizer;
  exports.Parser          = Parser;


  exports.parse = parse;
}));