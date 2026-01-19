import { memo, splitProps } from '../helpers.mjs';
import { createRecipe, mergeRecipes } from './create-recipe.mjs';

const chipFn = /* @__PURE__ */ createRecipe('undefined', {}, [])

const chipVariantMap = {}

const chipVariantKeys = Object.keys(chipVariantMap)

export const chip = /* @__PURE__ */ Object.assign(memo(chipFn.recipeFn), {
  __recipe__: true,
  __name__: 'chip',
  __getCompoundVariantCss__: chipFn.__getCompoundVariantCss__,
  raw: (props) => props,
  variantKeys: chipVariantKeys,
  variantMap: chipVariantMap,
  merge(recipe) {
    return mergeRecipes(this, recipe)
  },
  splitVariantProps(props) {
    return splitProps(props, chipVariantKeys)
  },
  getVariantProps: chipFn.getVariantProps,
})