# AI Coding Rules

本文件是当前项目的 AI coding 规范唯一真相源。

所有 coding agent 在创建、修改、重构代码时，必须优先遵守本文件。
`CLAUDE.md`、`AGENTS.md`、`.cursor/rules/code-style.mdc`、`.kiro/steering/code-style.md` 只作为入口文件引用本规范，不允许定义额外代码风格规则。

---

## 0. General Principles

### 0.1 Scope

本规范仅适用于当前仓库的 `apps/web` 前端子工程。

该前端子工程是长期迭代的大型前端项目，代码生成必须优先保持现有架构风格，不允许引入新的组织范式。

禁止引入以下架构变化：

- 不引入 `features` 架构
- 不重组现有目录结构
- 不为了“看起来更现代”主动重构大范围代码
- 不新增未被项目使用过的工程分层
- 不新增自动同步脚本或额外规则生成系统

### 0.2 Agent Behavior

AI coding agent 必须遵守：

- 最小修改原则：只修改与任务直接相关的代码。
- 保持一致原则：优先跟随当前文件、当前模块、当前项目已有风格。
- 明确边界原则：类型、常量、函数、hooks、components 必须放在对应位置。
- 禁止自由发挥：不要引入新的抽象、工具库、架构模式，除非用户明确要求。
- 禁止绕过规则：不要通过 `eslint-disable`、`ts-ignore`、`any` 等方式绕过问题，除非用户明确要求并说明原因。

---

## 1. Dependency Direction

项目代码必须保持清晰的依赖方向。

推荐依赖方向：

```text
components → hooks → utils/helpers → constants
```

类型文件只提供类型声明，不参与运行时逻辑。

### 1.1 Forbidden Dependencies

禁止以下反向依赖：

- `constants` 禁止依赖 `utils`、`hooks`、`components`
- `utils/helpers` 禁止依赖 `hooks`、`components`
- `hooks` 禁止依赖 `components`
- `types` 禁止包含运行时代码
- `index.ts` 禁止包含业务逻辑、运行时逻辑、副作用逻辑

---

## 2. Import / Export Rules

### 2.1 Named Export Only

所有需要导出的类型、常量、函数、hooks、components，必须使用具名导出。

禁止默认导出，除非项目已有框架约束必须使用默认导出。

```ts
// Good
const formatPrice = () => {};

export { formatPrice };
```

```ts
// Bad
export default formatPrice;
```

### 2.2 Export Must Be Placed at File Bottom

文件内定义的可导出内容，必须在文件末尾统一导出。

类型必须使用：

```ts
export type { UserDTO, UserUTO };
```

运行时值必须使用：

```ts
export { USER_STATUS, formatUserName };
```

禁止在声明处直接导出：

```ts
// Bad
export const USER_STATUS = {};
export type UserDTO = {};
```

### 2.3 Explicit Export Only

所有 `index.ts` 文件只能做显式导出。

```ts
// Good
export type { UserDTO, UserUTO } from './user';
export { USER_STATUS } from './user';
```

禁止使用：

```ts
// Bad
export * from './user';
```

### 2.4 Index File Rule

`index.ts` 只能作为导出聚合文件。

`index.ts` 禁止包含：

- 类型定义
- 常量定义
- 函数实现
- hooks 实现
- 组件实现
- 业务逻辑
- 副作用逻辑

---

## 3. Type Rules

### 3.1 Type Location

跨模块共享类型必须放在对应 scope 的 `types` 文件夹下。

类型文件必须按 scope 拆分。

示例：

```text
types/
  user.ts
  order.ts
  search.ts
  index.ts
```

允许在 component / hook 内定义局部类型，但仅限于以下情况：

- 类型只在当前文件内部使用
- 类型不是 props 类型
- 类型不会被其他组件、hooks、utils 复用
- 类型不会表达业务领域含义

### 3.2 Props Type Location

组件 props 类型必须定义在对应 scope 的 `types` 文件中。

不要在 component 文件内部定义 props 类型。

原因：

- 父子组件类型应该集中管理
- 避免子组件 props 从父组件类型中隐式推导
- 提升跨组件阅读和维护体验

### 3.3 Type Naming

来自 service / API 原始返回的数据类型，建议使用 `DTO` 后缀。

DTO 字段定义必须与接口文档保持一致，接口文档地址：`<!-- TODO: 替换为实际接口文档平台 URL -->`。

```ts
type UserDTO = {
  id: string;
  user_name: string;
};
```

经过 adapter 转换后，前端实际使用的数据类型，必须使用 `UTO` 后缀。

`UTO` 强调该类型是原始 API 数据经过 adapter 转换后的产物，字段命名、结构和原始 DTO 可能不同。未经转换直接使用的类型不应使用 `UTO` 后缀。

```ts
type UserUTO = {
  id: string;
  userName: string;
};
```

`DTO` 表示后端或 service 原始数据结构。
`UTO` 表示前端 UI / hook / component 实际消费的数据结构。

### 3.4 Shared Type Reuse

多个 methods / components / hooks 使用同一种类型结构时，必须抽取为共享类型。

禁止在多个文件中重复声明结构相同或高度相似的类型。

允许使用 `Pick`、`Omit`、`Partial`、`Required` 等 TypeScript 工具类型做类型推导，但必须保证可读性。

复杂类型推导必须增加注释说明原因。

### 3.5 Type Comment

所有导出的类型必须有多行注释，说明类型语义。

类型属性在以下情况必须加属性注释：

- 语义不明显，名字无法自解释
- 有业务约束或取值限制
- 与接口文档字段有特殊对应关系
- 默认值 / fallback 行为需要说明

自解释字段（`id`、`name`、`url` 等）可以不加属性注释。

```ts
/**
 * @description UserDTO is the raw user data returned by service.
 * It should not be used directly by UI components.
 */
type UserDTO = {
  id: string;
  user_name: string;
};

/**
 * @description UserUTO is the frontend user model used by hooks and components.
 */
type UserUTO = {
  id: string;
  userName: string;
};

export type { UserDTO, UserUTO };
```

---

## 4. Constant Rules

### 4.1 Constant Location

所有常量必须定义在对应 scope 的 `constants` 文件夹下。

禁止在业务代码中直接写 magic string / magic number。

例外：

- `module.scss` 中的样式值可以按 CSS / SCSS 方式维护
- 测试文件中的极简单断言值可根据项目现有风格处理

### 4.2 Constant Scope

常量必须按 scope 拆分文件。

示例：

```text
constants/
  user.ts
  order.ts
  search.ts
  index.ts
```

### 4.3 Constant Export

常量文件中需要导出的常量，必须在文件末尾统一导出。

```ts
/**
 * @description Default page size for search result list.
 * It is aligned with backend pagination default.
 */
const DEFAULT_SEARCH_PAGE_SIZE = 20;

/**
 * @description Maximum page size allowed by current search API.
 * Do not increase this value without backend confirmation.
 */
const MAX_SEARCH_PAGE_SIZE = 100;

export { DEFAULT_SEARCH_PAGE_SIZE, MAX_SEARCH_PAGE_SIZE };
```

### 4.4 Constant Index

`constants/index.ts` 只能做显式导出。

```ts
export { DEFAULT_SEARCH_PAGE_SIZE, MAX_SEARCH_PAGE_SIZE } from './search';
```

禁止：

```ts
export * from './search';
```

### 4.5 Constant Comment

所有常量必须有多行注释，说明：

- 这个常量是什么
- 为什么需要定义成这个值
- 是否与接口、产品、样式、业务规则有关

---

## 5. Utils / Helpers Rules

### 5.1 Utils / Helpers Location

公共可复用函数必须放在对应模块的 `utils` 或 `helpers` 文件夹下。

这里的 `utils/helpers` 不一定是全局目录。
模块内部可以拥有自己的 `utils/helpers`。

示例：

```text
search/
  utils/
    format-search-result.ts
    index.ts

user/
  helpers/
    normalize-user.ts
    index.ts
```

禁止把业务无关、业务相关、一次性逻辑全部堆到全局 `utils` 中。

### 5.2 Utils / Helpers Scope

函数必须按 scope 划分文件。

一个 utils/helper 文件只做一类明确的事情。

禁止一个文件同时处理多个无关职责。

### 5.3 Function Export

函数必须在文件底部统一导出。

```ts
const formatUserName = () => {};

export { formatUserName };
```

### 5.4 Function Style

函数必须使用箭头函数。

```ts
// Good
const handleUserClick = () => {};
```

禁止：

```ts
// Bad
function handleUserClick() {}
```

原因：

- 保持事件绑定行为一致
- 避免历史代码中 `this` 语义混乱
- 降低跨组件事件通讯中的上下文风险

### 5.5 Function Params

满足以下**任一条件**时，必须使用 object parameter：

- 参数数量 ≥ 3
- 参数数量 ≥ 2 且存在可选参数（`?` 修饰）

原因：可选参数是参数膨胀的早期信号，提前改为 object parameter 可避免后续因新增参数导致的大范围调用方重构。

禁止：

```ts
// Bad
const formatPrice = (price: number, currency: string, locale: string) => {};
```

必须：

```ts
type FormatPriceParams = {
  /**
   * @description Raw price amount.
   */
  price: number;

  /**
   * @description Currency code used for display.
   */
  currency: string;

  /**
   * @description Locale string used for Intl.NumberFormat (e.g. 'zh-CN', 'en-US').
   */
  locale: string;
};

/**
 * @description Format raw price into localized display text.
 * @param params Function input object.
 * @returns Localized price text.
 */
const formatPrice = (params: FormatPriceParams) => {
  const { price, currency, locale } = params;

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency
  }).format(price);
};

export { formatPrice };
```

### 5.6 Function Comment

所有导出的函数必须有多行注释。

必须包含：

- `@description`：函数职责
- `@param`：参数含义
- `@returns`：返回值含义

### 5.7 Pure Function Preference

utils/helpers 函数应尽可能保持纯函数。

优先满足：

- 相同输入得到相同输出
- 不修改入参
- 不依赖外部可变状态
- 不直接读写 DOM
- 不直接发起网络请求
- 不直接修改全局变量

如确实存在副作用，必须在函数注释中说明原因。

### 5.8 Error Handling in Utils / Helpers

如果 utils/helpers 中使用 `try/catch`，必须满足以下要求：

- 不允许静默吞掉异常
- 必须添加对应异常埋点或日志
- 必须复用项目已有异常上报 / 日志工具
- 不允许为了一个函数新增全新的异常上报体系
- 必须在注释中说明为什么这里需要捕获异常
- 必须说明异常发生后的降级策略或返回策略

示例：

```ts
/**
 * @description Safely parse JSON string from service response.
 * This function catches JSON parse errors because the backend field may be empty or malformed.
 * When parsing fails, it reports the error and returns fallback value.
 * @param params Function input object.
 * @returns Parsed object or fallback value.
 */
const safeParseJson = <T>(params: SafeParseJsonParams<T>) => {
  const { rawValue, fallbackValue, reportError } = params;

  try {
    return JSON.parse(rawValue) as T;
  } catch (error) {
    reportError({
      source: 'safeParseJson',
      error,
      extra: {
        rawValue
      }
    });

    return fallbackValue;
  }
};

export { safeParseJson };
```

### 5.9 Multi-branch Logic

涉及复杂多分支判断时，优先使用 `switch-case`。

当判断对象是 union type / enum-like object 时，优先结合 `satisfies` 做类型约束。

不要为了简单的二分支判断强行使用 `switch-case`。

---

## 6. Component Rules

### 6.1 Component Location and Export

components 使用与 constants / utils 相同的文件管理原则：

- 按 scope 管理
- 文件底部统一导出
- `index.ts` 只能做显式导出
- 禁止 `export *`

### 6.2 Component Responsibility

components 只负责 UI render。

components 禁止直接包含：

- API 请求
- 复杂数据转换
- 复杂业务规则
- 大段状态编排逻辑
- 可复用工具函数实现

组件中允许存在简单事件处理，但复杂逻辑必须抽离到 hooks 或 utils/helpers。

### 6.3 Props Type

组件 props 类型必须在对应 scope 的 `types` 文件中定义。

禁止在 component 文件内部定义 props 类型。

```ts
// Good
import type { UserCardProps } from '../types';
```

```ts
// Bad
type UserCardProps = {
  userName: string;
};
```

### 6.4 Component Comment

所有导出的组件必须有多行注释，说明组件职责。

```tsx
/**
 * @description Render user basic information card.
 * This component only handles UI rendering and does not contain data fetching logic.
 */
const UserCard = (props: UserCardProps) => {
  const { userName } = props;

  return <div>{userName}</div>;
};

export { UserCard };
```

### 6.5 FC Usage

`FC<Props>` 可选，不强制。

允许：

```tsx
const UserCard = (props: UserCardProps) => {};
```

也允许：

```tsx
const UserCard: FC<UserCardProps> = (props) => {};
```

但同一文件内必须保持一致。

### 6.6 Props Destructure

组件 props 应在函数体内部解构。

推荐：

```tsx
const UserCard = (props: UserCardProps) => {
  const { userName } = props;

  return <div>{userName}</div>;
};
```

避免在参数位置进行复杂解构。

### 6.7 Component Size

单个 component 文件禁止超过 120 行。

超过 120 行时，必须优先考虑：

- 拆分子组件文件
- 抽离 hooks
- 抽离 utils/helpers
- 抽离 constants
- 简化 render 分支

复杂度控制以项目 lint 规则为准，不允许通过禁用 lint 绕过复杂度限制。

### 6.8 No Inline Child Component

禁止在组件内部定义子组件。

禁止：

```tsx
const Parent = () => {
  const Child = () => {
    return <div>child</div>;
  };

  return <Child />;
};
```

必须拆成独立组件文件或当前 scope 下的独立组件声明。

### 6.9 Render and Logic Separation

组件应该尽可能保持 render 和逻辑分离。

复杂逻辑必须抽离：

- UI 状态编排 → hooks
- 数据转换 → utils/helpers
- 静态值 → constants
- 类型定义 → types

---

## 7. Hooks Rules

### 7.1 Hooks Location and Export

hooks 使用与 constants / utils 相同的文件管理原则：

- 按 scope 管理
- 文件底部统一导出
- `index.ts` 只能做显式导出
- 禁止 `export *`

### 7.2 Hooks Naming

hooks 必须使用 `useXxx` 命名。

```ts
const useUserList = () => {};
```

### 7.3 Hooks Params

满足以下**任一条件**时，hooks 入参必须使用 object parameter：

- 参数数量 ≥ 3
- 参数数量 ≥ 2 且存在可选参数（`?` 修饰）

原因：可选参数是参数膨胀的早期信号，提前改为 object parameter 可避免后续因新增参数导致的大范围调用方重构。


禁止：

```ts
// Bad
const useUserList = (userId: string, pageSize: number) => {};
```

必须：

```ts
type UseUserListParams = {
  /**
   * @description Current user id.
   */
  userId: string;

  /**
   * @description Page size for user list query.
   */
  pageSize: number;
};

/**
 * @description Manage user list query state and data orchestration.
 * @param params Hook input object.
 * @returns User list state and actions.
 */
const useUserList = (params: UseUserListParams) => {
  const { userId, pageSize } = params;

  // ...
};

export { useUserList };
```

### 7.4 Hooks Comment

所有导出的 hooks 必须有多行注释。

必须说明：

- hook 的职责
- 参数含义
- 返回值含义
- 是否包含网络请求
- 是否依赖外部状态

### 7.5 Hooks Responsibility

hooks 负责：

- UI state orchestration
- data orchestration
- event behavior composition
- component logic extraction

hooks 不应该直接承载复杂业务规则。

复杂业务判断、复杂数据转换、复杂分支逻辑必须拆到 utils/helpers 中，并通过 hooks 调用。

### 7.6 Data Fetching Hooks

如果 hook 涉及网络请求，必须参考 query / mutation 分离的设计思路组织入参和返回值。

应明确：

- query key
- request params
- enabled condition
- loading state
- error state
- data transform result

禁止在 component 中直接处理复杂请求状态。

### 7.7 Hooks Must Not Become Service Layer

hooks 不应该变成 service layer。

禁止在 hooks 中堆积：

- 复杂 DTO → UTO adapter 逻辑
- 大段 if/else 业务规则
- 多个无关请求的复杂编排
- 可复用纯函数逻辑

这些逻辑应按性质拆分：纯函数逻辑拆到对应 scope 的 utils/helpers 中，有 React 状态 / 副作用的逻辑拆到子 hook，可复用的请求封装拆到 service。

---

## 8. DTO / UTO Adapter Rules

### 8.1 Adapter Responsibility

DTO → UTO 的转换逻辑必须独立管理。

禁止在 component 中直接消费复杂 DTO。

禁止在 component 中直接写 DTO 字段兼容逻辑。

### 8.2 Adapter Location

DTO → UTO adapter 应放在对应 scope 的 utils/helpers 中。

示例：

```text
user/
  helpers/
    adapt-user-dto-to-uto.ts
    index.ts
```

### 8.3 Adapter Naming

adapter 函数命名必须表达转换方向。

```ts
const adaptUserDTOToUTO = () => {};
```

### 8.4 Adapter Comment

adapter 必须有注释说明：

- 输入 DTO 来源
- 输出 UTO 用途
- 字段转换原因
- 默认值 / fallback 策略

---

## 9. Magic String / Number Rules

禁止在业务代码中直接出现 magic string / magic number。

必须抽离到 constants，并通过多行注释说明含义。

禁止：

```ts
if (status === 'success') {
}
```

必须：

```ts
if (status === USER_STATUS.SUCCESS) {
}
```

允许以下情况不抽离：

- `module.scss`
- 极简单 JSX 文案，且项目现有风格允许
- 测试中的简单断言值，且不会被复用
- TypeScript union literal type 中的字面量类型

---

## 10. Comments Rules

### 10.1 Required Comments

以下内容必须有多行注释：

- exported type
- exported constant
- exported function
- exported hook
- exported component
- try/catch 中的异常处理策略
- 复杂类型推导
- DTO → UTO adapter

### 10.2 Comment Quality

注释必须解释语义和原因。

好的注释说明：

- 这是什么
- 为什么存在
- 为什么这样设计
- 失败时如何降级

避免无意义注释：

```ts
// Bad
/**
 * @description handle click
 */
const handleClick = () => {};
```

---

## 11. Lint and Complexity Rules

复杂度控制必须交给项目 lint / CI 规则。

AI coding agent 必须遵守项目已有 lint 规则。

禁止：

- 新增 `eslint-disable` 绕过规则
- 新增 `@ts-ignore` 绕过类型错误
- 使用 `any` 规避类型设计
- 为了通过编译删除已有校验逻辑

如 lint 报错，必须优先修正代码结构，而不是关闭规则。

---

## 12. Human Review Checklist

### 12.1 Type Check

- [ ] 跨模块共享类型是否放在 `types`
- [ ] component props 是否放在对应 `types` 文件
- [ ] exported type 是否在文件底部使用 `export type {}` 统一导出
- [ ] `types/index.ts` 是否只做显式导出
- [ ] 是否存在 `export *`
- [ ] DTO / UTO 命名是否清晰
- [ ] exported type 是否有多行注释

### 12.2 Constant Check

- [ ] 是否存在 magic string / magic number
- [ ] 常量是否放在对应 scope 的 `constants`
- [ ] exported constant 是否在文件底部统一导出
- [ ] `constants/index.ts` 是否只做显式导出
- [ ] 常量是否有多行注释说明含义和原因

### 12.3 Utils / Helpers Check

- [ ] 公共可复用函数是否放在对应模块的 `utils/helpers`
- [ ] 函数是否使用箭头函数
- [ ] 多参数函数是否使用 object parameter
- [ ] exported function 是否在文件底部统一导出
- [ ] 是否尽可能保持纯函数
- [ ] try/catch 是否有异常埋点或日志
- [ ] try/catch 是否有注释说明异常原因和降级策略
- [ ] 复杂多分支是否优先考虑 switch-case

### 12.4 Component Check

- [ ] component 是否只负责 UI render
- [ ] props 类型是否放在 `types`
- [ ] component 文件是否超过 120 行
- [ ] 是否在组件内部定义了子组件
- [ ] 是否把复杂逻辑抽离到 hooks
- [ ] 是否把数据转换抽离到 utils/helpers
- [ ] exported component 是否有多行注释
- [ ] 是否在文件底部统一导出

### 12.5 Hooks Check

- [ ] hook 是否使用 `useXxx` 命名
- [ ] hook 入参是否为 object parameter
- [ ] hook 是否有多行注释
- [ ] hook 是否直接承载了复杂业务规则
- [ ] 复杂业务判断是否拆到了 utils/helpers
- [ ] 网络请求 hook 是否参考 TanStack Query 风格
- [ ] exported hook 是否在文件底部统一导出

### 12.6 General Check

- [ ] 是否违反 `components → hooks → utils/helpers → constants` 的依赖方向
- [ ] 是否引入了新架构范式
- [ ] 是否做了与任务无关的大范围重构
- [ ] 是否新增了不必要的依赖
- [ ] 是否绕过 lint / TypeScript 检查
- [ ] 是否保持了当前模块已有代码风格
