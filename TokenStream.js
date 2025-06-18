// TokenStream接受一个InputStream对象作为参数.
// TokenStream从输入流中读取token, 进行词法分析.
// TokenStream的实现包含了两类函数, 一类是is_XXX, 用来判断字符是否符合某种类型, 返回boolean类型, 作为read_while()的参数, 参与read_XXX()的过程中.
// 另一类是read_XXX, 用来返回特定类型的token. punc和op处理简单, 所以并没有单独的read_punc()和read_op()函数, 而是直接在read_next()中处理.
function TokenStream(input) {
  var current = null;
  var keywords = " if then else lambda λ true false ";
  return {
    // next返回下一个token, 如果没有token了返回null.
    // peek返回下一个token, 但不消耗它, 如果没有token了返回null.
    // eof判断是否到达文件末尾.
    // croak抛出错误, 并显示行号和列号.
    next: next,
    peek: peek,
    eof: eof,
    croak: input.croak
  };
  function is_keyword(x) {
    // 通过在关键字字符串两端添加空格来避免匹配子字符串.
    return keywords.indexOf(" " + x + " ") >= 0;
  }
  function is_digit(ch) {
    // 判断字符是否是数字.
    return /[0-9]/i.test(ch);
  }
  function is_id_start(ch) {
    // 判断字符是否是变量或关键词的起始字符. 这里不做判断.
    return /[a-zλ_]/i.test(ch);
  }
  function is_id(ch) {
    // 判断字符时候是变量
    return is_id_start(ch) || "?!-<>=0123456789".indexOf(ch) >= 0;
  }
  function is_op_char(ch) {
    // 判断字符是否是运算符, 等号=除外.
    return "+-*/%=&|<>!".indexOf(ch) >= 0;
  }
  function is_punc(ch) {
    // 判断字符是否是标点符号.
    return ",;(){}[]".indexOf(ch) >= 0;
  }
  function is_whitespace(ch) {
    // 判断字符是否是空白符.
    return " \t\n".indexOf(ch) >= 0;
  }
  function read_while(predicate) {
    // 很巧妙, 传递进来一个predicate方法名, 通过这个方法判断peek()是否成立, 成立就接着读下去, 然后用next()读取并弹出当前字符, current指向下一个.
    var str = "";
    while (!input.eof() && predicate(input.peek()))
      str += input.next();
    return str;
  }
  function read_number() {
    var has_dot = false;
    // 用了一个匿名方法传递给read_while(), 和lisp太像啦! 当遇到两个dot的时候直接把false返回给read_while(), parseFloat是JS内置函数, 把字符串转化成数字.
    var number = read_while(function(ch){
      if (ch == ".") {
        if (has_dot) return false;
        has_dot = true;
        return true;
      }
      return is_digit(ch);
    });
    return { type: "num", value: parseFloat(number) };
  }
  function read_ident() {
    // is_id并不区分变量和关键词, 在return的时候通过is_keyword()来填写是kw还是var.
    var id = read_while(is_id);
    return {
      type: is_keyword(id) ? "kw" : "var",
      value: id
    };
  }
  function read_escaped(end) {
    // 很妙的一个函数, 接受的是结束字符, 比如", read_next()中用这个函数处理字符串的情况.
    // 当escaped是true的时候, 说明上一个字符是转义符, 直接把当前字符添加到字符串中, 同时把escaped标志清零. 
    // 如果遇到了\\就把标志设为true.
    // 如果当前字符是结束字符, 跳出循环.
    var escaped = false, str = "";
    input.next();
    while (!input.eof()) {
      var ch = input.next();
      if (escaped) {
        str += ch;
        escaped = false;
      } else if (ch == "\\") {
        escaped = true;
      } else if (ch == end) {
        break;
      } else {
        str += ch;
      }
    }
    return str;
  }
  function read_string() {
    return { type: "str", value: read_escaped('"') };
  }
  function skip_comment() {
    // 读取到#号, 说明是注释, 通过read_while()读取到换行符为止, 然后next()跳过换行符.
    read_while(function (ch) { return ch != "\n" });
    input.next();
  }
  function read_next() {
    // 读取下一个token, 根据不同条件, 使用不同的处理函数.
    // 先跳过空白符.
    // 再判断是否是文件末尾.
    // 能看出不同情况的优先级, 注释 > 字符串 > 数字 > 变量
    // 这里用的peek()是input的方法, 而不是TokenStream的方法, 用input.peek()是用来查看下一个字符的, 而不是下一个token.
    read_while(is_whitespace);
    if (input.eof()) return null;
    var ch = input.peek();
    if (ch == "#") {
      skip_comment();
      return read_next();
    }
    if (ch == '"') return read_string();
    if (is_digit(ch)) return read_number();
    if (is_id_start(ch)) return read_ident();
    if (is_punc(ch)) return {
      type: "punc",
      value: input.next()
    };
    if (is_op_char(ch)) return {
      type: "op",
      value: read_while(is_op_char)
    };
    input.croak("Can't handle character: " + ch);
  }
  function peek() {
    // current作为缓存, 保存读到的token, 如果没有调用next()把current置为null, 就不会重新读取token并设置current.
    // 这是TokenStream的peek()方法, 与InputStream的peek()不同.
    return current || (current = read_next());
  }
  function next() {
    var tok = current;
    current = null;
    return tok || read_next();
  }
  function eof() {
    return peek() == null;
  }
}
