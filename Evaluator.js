function Environment(parent) {
  // 用来创建一个新环境的构造函数, 接收一个 parent 参数
  // 如果 parent 存在, 则新环境将继承 parent, 如不存在则为 null, 同时把当前环境的父类设置为传入的 parent 参数.
  // 值得注意的是, Environment 创建的对象里有一个 vars, vars 的键就是变量名, 比如 "x", 键的值就是变量对应的值比如 "42".
  // 后面会看到使用 hasOwnProperty 检查 vars 中是否记录了某个变量和其值.
  // 这里有一个很有意思的 JS 概念----原型链. 首先, JS 每个对象都隐式自带一个 __proto__ 属性, 这个属性类似于 C 语言里的指针. 其次, Object.create() 创建了一个 __proto__ 指针指向 parent.vars 的空对象(或者说 [[Prototype]] 指向 parent.vars 的空对象, 在 JS 规范里叫 [[Prototype]] 内部槽). 最后, 把 Object.create() 创建的对象赋值给 this.vars, 这样就形成了一个原型链.
  this.vars = Object.create(parent ? parent.vars : null);
  this.parent = parent;
}

Environment.prototype = {
  // .prototype 是 JS 的一个特殊属性, 每个函数都有一个 .prototype, 用于存放"共享的方法与属性". 使用 new 创建新对象的时候, 新对象会继承这个 .prototype.
  // 默认的 .prototype 是一个空对象, 但我们可以给它添加方法和属性.
  extend: function () {
    // 学习过 SICP 感觉这个概念还是挺好理解的, extend 相当于在当前的环境上 fork 了一份, 然后传递给调用者, 比如: var localEnv = globalEnv.extend();
    return new Environment(this);
  },
  lookup: function (name) {
    // scope被赋值为this, 比如globalEnv.lookup("x")就是globalEnv.
    var scope = this;
    while (scope) {
      // 首先是 hasOwnProperty, 这是一个 Object 的方法, 用来检查对象是否有某个属性.
      // 其次是 call, call 接受两个参数, 第一个是 this 指向的对象, 第二个是要通过 hasOwnProperty 检查的属性名.
      // 还记得之前说的 __proto__ 嘛? 这里的 scope.vars 的 __proto__ 指针指向了 parent.vars, 但是scope.vars本身没有 name 属性. 我们不断向上查询, 找到真正拥有 name 的环境. hasOwnProperty 只检查当前环境"本地"的属性名.
      if (Object.prototype.hasOwnProperty.call(scope.vars, name))
        return scope;
      scope = scope.parent;
    }
  },
  get: function (name) {
    // in能顺着原型链检查一个属性是否存在于对象中.
    if (name in this.vars)
      return this.vars[name];
    throw new Error("Undefined variable " + name);
  },
  set: function (name, value) {
    // set 在搜索全局环境, 比如以 globalEnv 起始的环境链时, 遇到未定义的变量, 则直接创建一个新的全局变量.
    // 若在局部环境, 向上查找变量被定义的那个作用域 (scope), 然后修改该变量的值. 未找到则抛出错误.
    var scope = this.lookup(name);
    if (!scope && this.parent)
      throw new Error("Undefined variable " + name);
    return (scope || this).vars[name] = value;
  },
  def: function (name, value) {
    // def 用于定义一个新变量, 如果变量已经存在, 则覆盖它的值.
    return this.vars[name] = value;
  }
};

function evaluate(exp, env) {
  // evaluate() 就是求值器的入口函数, 接受上一步 parse() 得到的 AST, 因为 AST 起始肯定是 prog 节点, 所以 prog 中的对每个结点做 forEach() 求值操作.
  switch (exp.type) {
    case "num":
    case "str":
    case "bool":
      return exp.value;
    case "var":
      return env.get(exp.value);
    case "assign":
      if (exp.left.type != "var")
        throw new Error("Cannot assign to " + JSON.stringify(exp.left));
      return env.set(exp.left.value, evaluate(exp.right, env));
    case "binary":
      var left = evaluate(exp.left, env);
      if (exp.operator === "&&") {
        return left != false ? left : evaluate(exp.right, env);
      }
      if (exp.operator === "||") {
        return left !== false ? left : evaluate(exp.right, env);
      }
      return apply_op(exp.operator,
        left,
        evaluate(exp.right, env));
    case "lambda":
      return make_lambda(env, exp);
    case "if":
      var cond = evaluate(exp.cond, env);
      if (cond !== false) return evaluate(exp.then, env);
      return exp.else ? evaluate(exp.else, env) : false;
    case "prog":
      // 内部的 exp 指的是 exp.prog 数组中的每一个元素.
      var val = false;
      exp.prog.forEach(function (exp) { val = evaluate(exp, env) });
      return val;
    case "call":
      var func = evaluate(exp.func, env);
      return func.apply(null, exp.args.map(function (arg) {
        return evaluate(arg, env);
      }));
    case "let":
      exp.vars.forEach(function (v) {
        var scope = env.extend();
        scope.def(v.name, v.def ? evaluate(v.def, env) : false);
        env = scope;
      });
    default:
      throw new Error("I don't know how to evaluate " + exp.type);
  }
}

function apply_op(op, a, b) {
  function num(x) {
    if (typeof x != "number")
      throw new Error("Expected number but got " + x);
    return x;
  }
  function div(x) {
    if (num(x) == 0)
      throw new Error("Divide by zero");
    return x;
  }
  switch (op) {
    case "+": return num(a) + num(b);
    case "-": return num(a) - num(b);
    case "*": return num(a) * num(b);
    case "/": return num(a) / div(b);
    case "%": return num(a) % div(b);
    case "&&": return a !== false && b;
    case "||": return a !== false ? a : b;
    case "<": return num(a) < num(b);
    case ">": return num(a) > num(b);
    case "<=": return num(a) <= num(b);
    case ">=": return num(a) >= num(b);
    case "==": return a === b;
    case "!=": return a !== b;
  }
  throw new Error("Can't apply operator " + op);
}
function make_lambda(env, exp) {
  // 和前面 Parser 里面的 parse_lambda() 对应, exp.vars 保存的是需要的变量名, exp.body 保存 procedure 主体.
  if (exp.name) {
    // 如果 而 exp.name 存在, 那就定义一个新变量名为 exp.name, 值为 lambda.
    env = env.extend();
    env.def(exp.name, lambda);
  }
  function lambda() {
    var names = exp.vars;
    var scope = env.extend();
    for (var i = 0; i < names.length; ++i)
      scope.def(names[i], i < arguments.length ? arguments[i] : false);
    return evaluate(exp.body, scope);
  }
  return lambda;
}