/* eslint-disable no-param-reassign */
import { useRef, useMemo, useEffect, useCallback, useState } from 'react';
import { ConfigProvider, Empty, Form, Spin } from 'antd';
import { Grid } from '../index';
import { uuid, EventEmit, AsyncOptionsCache, queryFieldByName } from '../util';
import cloneDeep from 'lodash/cloneDeep';
import Item from './item';
import FieldSet from '@/widgets/extension/fields-set';
import { CoreFormProps } from './type.form';
import CoreForm from './index';
import { parseBeforeReceive, tranfromSchema } from './util';
import zhCN from 'antd/lib/locale/zh_CN';
import { expansionInstanceMethod } from './tool';
import './index.less';

// column布局映射关系
const labelColMap = [4, 6, 8, 10];
const wrapperColMap = [20, 18, 16, 14];
export default ({
  schema = [],
  widgets = {}, // 注入自定义组件
  readOnly = false, // 视图展示
  disabled = false, // 全部表单不可用
  form = CoreForm.useForm()[0],
  column = 1,
  gridStyle = {
    columnGap: 20,
    rowGap: 0,
  },
  className = '',
  /** form-props */
  initialValues = {},
  onValuesChange = () => {},
  onMount = () => {},
  locale = zhCN,
  getScrollContainer, // 设置滚动容器
  scrollToFirstError = true, // 默认开启滚动到第一个错误的位置
  layout = 'vertical', // 默认使用垂直布局
  readOnlyEmptyValueNode = '-',
  formConfig,
  ...rest
}: CoreFormProps) => {
  /**
   * 处理默认布局
   * layout: 使用传入,没有传入按照SearchForm使用horizontal、Form使用vertical
   * labelCol 使用传入,没有传入按照layout是vertical就固定24,否则按照column映射取
   * wrapperCol 使用传入,没有传入按照layout是vertical就固定24,否则按照column映射取
   */
  const labelCol =
    rest.labelCol ?? layout === 'vertical'
      ? { span: 24 }
      : { span: labelColMap[column - 1] };
  const wrapperCol =
    rest.wrapperCol ?? layout === 'vertical'
      ? { span: 24 }
      : { span: wrapperColMap[column - 1] };
  const [antdForm]: any = Form.useForm();
  const name: string = useMemo(() => {
    return `form_${uuid(10)}`;
  }, []);
  // 一个表单对应一个发布订阅
  const event = useMemo(() => {
    return new EventEmit();
  }, []);
  // 判断是否是初次加载
  const firstRender: any = useRef(true);
  const [spin, setSpin] = useState(false);
  // 克隆 fields
  const cloneSchema = useMemo(() => {
    const newFields =
      typeof schema === 'function'
        ? cloneDeep(schema(form))
        : cloneDeep(schema);
    tranfromSchema(newFields, name, column, formConfig); // 内部转换下
    return newFields;
  }, [schema]); // cloneDeep 避免被污染
  // 处理下接受之前的转换
  const _initialValues = parseBeforeReceive({ ...initialValues }, cloneSchema, {
    name,
    form,
    initialValues,
  });
  // 获取 formList api
  const actionRef = useRef({});
  // 初次渲染进行扩展实例Api
  if (firstRender.current) {
    /** 实例扩展方法 */
    expansionInstanceMethod({
      form,
      antdForm,
      name,
      initialValues: _initialValues,
      cloneSchema,
      event,
      scrollToFirstError,
      getScrollContainer,
      actionRef,
      setSpin,
    });
  }
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      onMount(form); // 第一次渲染完毕将Form实例吐出
    }
    return () => {
      // 卸载清除缓存
      Object.keys(AsyncOptionsCache).forEach((key) => {
        if (key.startsWith(name)) {
          delete AsyncOptionsCache[key];
        }
      });
    };
  }, []);
  // 值改变 setFieldsValue不会触发该方法
  const onChange = (value: any, values: any) => {
    const key = Object.keys(value)[0];
    const field: any = queryFieldByName(cloneSchema, key); // 查找指定的field
    const fieldValue = value[key];
    if (field.type === 'FormList' && Array.isArray(fieldValue)) {
      // 兼容 FormList
      const index = fieldValue.findIndex((i) => typeof i === 'object');
      if (index > -1) {
        const innerName = Object.keys(fieldValue[index])[0];
        // 组装 FormList 指定项的改表字段 name
        event.publish({
          name: [key, index, innerName].join(','),
        });
      }
    } else {
      // 发布通知
      event.publish({
        name: key,
      });
    }
    onValuesChange(value, values); // 通知外面
  };
  /** render FieldSet children */
  const RenderFieldSet = ({ field }) => {
    // 支持函数默认参数为form
    const childrenFields =
      typeof field.props?.children === 'function'
        ? field.props?.children(form)
        : field.props?.children;
    // 格式处理下
    if (typeof field.props?.children === 'function') {
      tranfromSchema(childrenFields, name, field.props.column);
    }
    return childrenFields ? (
      <Grid
        gridStyle={field.props.gridStyle || gridStyle}
        column={field.props.column || 1}
      >
        <RenderSchema itemSchema={childrenFields || []} />
      </Grid>
    ) : (
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
    );
  };
  /** render field */
  const RenderSchema = useCallback(
    ({ itemSchema = [] }): any => {
      return itemSchema.map((field: any, index: number) => {
        if (field.type === 'FieldSet') {
          // 基于gridColumnStart设置列数
          let style = field.style || {};
          if (field.span) {
            style = {
              ...style,
              gridColumnStart: `span ${field.span}`,
            };
          }
          if (!field.name) {
            // eslint-disable-next-line no-console
            console.warn('FieldSet 缺少 name 属性');
          }
          // 支持函数默认参数为form
          const childrenFields =
            typeof field.props?.children === 'function'
              ? field.props?.children(form)
              : field.props?.children;
          // 格式处理下
          if (typeof field.props?.children === 'function') {
            tranfromSchema(childrenFields, name, field.props.column);
          }
          const FormItem = (
            <FieldSet
              key={field.name}
              fieldName={field.name}
              label={field.label}
              style={style}
              extra={field.props?.extra}
              subTitle={field.props?.subTitle}
              form={form}
              initialValues={_initialValues}
              effect={field.effect}
              visible={field.visible}
              event={event}
            >
              <RenderFieldSet field={field} />
            </FieldSet>
          );
          // 返回节点
          let vNode = FormItem;
          // 异步渲染
          if (typeof field.itemRender === 'function') {
            vNode = field.itemRender(FormItem, {
              field,
              form,
              disabled,
              readOnly,
            });
          }
          return vNode;
        }
        return (
          <Item
            event={event}
            className={field.className || ''}
            disabled={disabled || field?.props?.disabled}
            readOnly={readOnly}
            onChange={onChange}
            form={form}
            widgets={widgets}
            initialValues={_initialValues}
            field={field}
            key={field.name || field.key || index}
            readOnlyEmptyValueNode={readOnlyEmptyValueNode}
            actionRef={
              ['FormList', 'TableList'].includes(field.type)
                ? actionRef
                : undefined
            }
          />
        );
      });
    },
    [disabled, readOnly],
  );
  // 组装类名
  const _className = [`core-form-${layout}`];
  if (className) {
    _className.push(className);
  }
  if (readOnly) {
    _className.push('core-form-readonly');
  }
  return (
    <ConfigProvider locale={locale}>
      <Spin spinning={spin}>
        <Form
          layout={layout}
          labelCol={labelCol}
          wrapperCol={wrapperCol}
          className={_className.join(' ')}
          form={antdForm}
          name={name}
          initialValues={_initialValues}
          onValuesChange={onChange}
          {...rest}
        >
          <Grid gridStyle={gridStyle} column={column}>
            <RenderSchema itemSchema={cloneSchema} />
          </Grid>
        </Form>
      </Spin>
    </ConfigProvider>
  );
};
