import { memo, splitProps } from '../helpers.mjs';
import { createRecipe, mergeRecipes } from './create-recipe.mjs';

const toolbarFn = /* @__PURE__ */ createRecipe('undefined', {
  "density": "comfortable"
}, [])

const toolbarVariantMap = {
  "density": [
    "comfortable",
    "compact"
  ]
}

const toolbarVariantKeys = Object.keys(toolbarVariantMap)

export const toolbar = /* @__PURE__ */ Object.assign(memo(toolbarFn.recipeFn), {
  __recipe__: true,
  __name__: 'toolbar',
  __getCompoundVariantCss__: toolbarFn.__getCompoundVariantCss__,
  raw: (props) => props,
  variantKeys: toolbarVariantKeys,
  variantMap: toolbarVariantMap,
  merge(recipe) {
    return mergeRecipes(this, recipe)
  },
  splitVariantProps(props) {
    return splitProps(props, toolbarVariantKeys)
  },
  getVariantProps: toolbarFn.getVariantProps,
})