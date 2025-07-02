var FALSE = { type: "bool", value: false };
function parse(input) {
  var PRECEDENCE = {
    "=": 1,
    "||": 2,
    "&&": 3,
    "<": 7, ">": 7, "<=": 7, ">=": 7, "==": 7, "!=": 7,
    "+": 10, "-": 10,
    "*": 20, "/": 20, "%": 20,
  };
  // parse_toplevel() 是 parse 的入口函数, 负责解析整个程序.
  // 它会调用 parse_expression() 来解析表达式, 最终返回一个包含所有表达式的对象.
  return parse_toplevel();
  // 所有 is_XXX 系列函数都返回一个 token. 如果没有传入参数, 则返回 peek() 的结果. 如果传入了参数, 则判断 peek() 的 token 是否符合要求, 如果符合则返回 peek() 的 token, 否则返回 false.
  function is_punc(ch) {
    var tok = input.peek();
    return tok && tok.type == "punc" && (!ch || tok.value == ch) && tok;
  }
  function is_kw(kw) {
    var tok = input.peek();
    return tok && tok.type == "kw" && (!kw || tok.value == kw) && tok;
  }
  function is_op(op) {
    var tok = input.peek();
    return tok && tok.type == "op" && (!op || tok.value == op) && tok;
  }
  function skip_punc(ch) {
    if (is_punc(ch)) input.next();
    else input.croak("Expecting punctuation: \"" + ch + "\"");
  }
  function skip_kw(kw) {
    if (is_kw(kw)) input.next();
    else input.croak("Expecting keyword: \"" + kw + "\"");
  }
  function skip_op(op) {
    if (is_op(op)) input.next();
    else input.croak("Expecting operator: \"" + op + "\"");
  }
  function unexpected() {
    input.croak("Unexpected token: " + JSON.stringify(input.peek()));
  }
  function maybe_binary(left, my_prec) {
    // 先判断是否是 operator
    // 对比当前和下一个 token 的 precedence, 若大于, 则弹出 operator, 返回一个新的 maybe_binary 表达式.
    // 新的 maybe_binary 的 left 是当前的 left, right 是通过再次对 parse_atom() 解析出来的 token 求 maybe_binary 的结果.
    // 注意 maybe_binary 的截至条件, 当 his_prec 严格大于 my_prec 时才向右递归, 所以同一优先级的运算符不会再进入下一层递归, 自然就按从左到右结合. 当 right 的 maybe_binary 遇到更高级或同级的 operator 会回归到上一层. 然后被上一层包裹, 包裹后的 my_prec 重返为 0.
    // 直到没有更高级的 operator, 返回最终的表达式. maybe_binary 解析完成
    // 当 is_op 为 null 时, 直接返回 left.
    var tok = is_op();
    if (tok) {
      var his_prec = PRECEDENCE[tok.value];
      if (his_prec > my_prec) {
        input.next();
        return maybe_binary({
          type: tok.value == "=" ? "assign" : "binary",
          operator: tok.value,
          left: left,
          right: maybe_binary(parse_atom(), his_prec)
        }, my_prec);
      }
    }
    return left;
  }
  function delimited(start, stop, separator, parser) {
    // 这里很有意思, parser 是 delimited 用来解析除了 start, stop, separator 内容之外的函数.
    // 有趣的是 while 循环中处理的优先级.
    // 先判断 stop, 如果是直接返回.
    // 当第一次 while 开始时, first 为 true, 将 first 设为 false 然后继续. 当第二次执行时, a.push(parser()) 已经被执行过了, 所以如果 token 不是 stop, 就一定会是 separator.
    // 为什么要再次判断 is_punc 呢? 因为要处理 {a, b, c,} 这种情况, 防止在跳过 separator 后，紧跟着就是 stop.
    var a = [], first = true;
    skip_punc(start);
    while (!input.eof()) {
      if (is_punc(stop)) break;
      if (first) first = false; else skip_punc(separator);
      if (is_punc(stop)) break;
      a.push(parser());
    }
    skip_punc(stop);
    return a;
  }
  function parse_call(func) {
    return {
      type: "call",
      func: func,
      args: delimited("(", ")", ",", parse_expression),
    };
  }
  function parse_varname() {
    var name = input.next();
    if (name.type != "var") input.croak("Expecting variable name");
    return name.value;
  }
  function parse_if() {
    // if cond then execute (else execute)的结构是固定的, parse_if只要按照这个顺序解析就行.
    skip_kw("if")
    var cond = parse_expression();
    if (!is_punc("{")) skip_kw("then");
    var then = parse_expression();
    var ret = {
      type: "if",
      cond: cond,
      then: then,
    };
    if (is_kw("else")) {
      input.next();
      ret.else = parse_expression();
    }
    return ret;
  }
  function parse_lambda() {
    // 封装一层 delimited(), 专用于解析 lambda 表达式, 返回一个"lambda"类型的对象.
    return {
      type: "lambda",
      vars: delimited("(", ")", ",", parse_varname),
      body: parse_expression()
    };
  }
  function parse_bool() {
    return {
      type: "bool",
      value: input.next().value == "true"
    };
  }
  function maybe_call(expr) {
    // expr = expr()用函数的结果来局部 shadow 原来的函数变量, 不会影响到全局环境.
    // parse_call(expr) 专门用来处理函数调用也就是"("和")"之间的内容, 若没有"(", 则直接返回 expr. 也就是说 foo() 和 foo 都是合法的, 前者会被 parse_call 处理, 后者直接返回 expr.
    // maybe_call() 通过检测下一个字符是不是"(", 来判断是否是函数调用.
    expr = expr();
    return is_punc("(") ? parse_call(expr) : expr;
  }
  function parse_atom() {
    // 这里的递归调用很有意思, 如果是一个最小单元, 比如数字, 字符串, 变量名, 则直接返回这个token.
    // 如果是"()", "{}","if", "true", "false", "lambda"等, 则会调用对应的解析函数.
    return maybe_call(function () {
      if (is_punc("(")) {
        input.next();
        var exp = parse_expression();
        skip_punc(")");
        return exp;
      }
      if (is_punc("{")) return parse_prog();
      if (is_kw("if")) return parse_if();
      if (is_kw("true") || is_kw("false")) return parse_bool();
      if (is_kw("lambda") || is_kw("λ")) {
        input.next();
        return parse_lambda();
      }
      var tok = input.next();
      if (tok.type == "var" || tok.type == "num" || tok.type == "str") return tok;
      unexpected();
    });
  }
  function parse_toplevel() {
    var prog = [];
    while (!input.eof()) {
      prog.push(parse_expression());
      if (!input.eof()) skip_punc(";");
    }
    return { type: "prog", prog: prog };
  }
  function parse_prog() {
    // 是对 delimited() 的一个封装, 专门用来解析程序块.
    var prog = delimited("{", "}", ";", parse_expression);
    if (prog.length == 0) return FALSE;
    if (prog.length == 1) return prog[0];
    return { type: "prog", prog: prog };
  }
  function parse_expression() {
    // 这里挺绕的, 因为 parse_expression(), parse_atom(), maybe_call()和 maybe_binary()有递归调用.
    // maybe_binary 依赖于 parse_atom().
    // parse_expression 依赖于 maybe_call() 和 maybe_binary().
    // parse_atom() 依赖于 maybe_call() 解决非最小单元的情况.
    // 不过 maybe_call() 比较特殊, maybe_call() 接受一个函数作为处理函数, 可以是 parse_atom() 或 parse_expression() 等. 这是 Higher-order Pratt 的常用技巧, 把 '解析一个更高优先级子表达式' 的逻辑从解析器的主循环中分离出来, 让解析器更简洁, 同时也能处理更复杂的表达式.
    // 内层 maybe_call(在 parse_atom 里) ⇒ 处理 atom 后紧跟着的"()".
    // 外层 maybe_call(在 parse_expression 里) ⇒ 处理整个二元表达式后紧跟着的"()".
    // 几个函数相互包含, 有点烧脑. 但是归根结底, 万物本源(本质)是 parse_atom() 遇到 variable, number, string 等最小单元, 会直接返回这个 token. 若不是, 再去调用 maybe_call() 和 maybe_binary() 来处理函数调用和二元运算.
    // 简而言之解析最小语法单元首先靠 parse_atom(),其余都是围绕它做组合.
    // 一切的起点是 parse_expression(), 它最早给 maybe_binary() 传入的 my_prec 为 0, 也就是最低优先级. 这样 maybe_binary() 就会一直递归下去, 直到没有更高级的 operator 为止.
    // 也就是说, parse_expression() 是一个启动函数, 负责解析整个表达式.
    return maybe_call(function () {
      return maybe_binary(parse_atom(), 0);
    });
  }
}