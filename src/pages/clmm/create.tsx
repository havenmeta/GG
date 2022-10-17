import { createRef, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Fraction } from '@raydium-io/raydium-sdk'

import Decimal from 'decimal.js'
import { twMerge } from 'tailwind-merge'

import useAppSettings from '@/application/common/useAppSettings'
import {
  calLowerUpper, getPriceBoundary, getPriceTick, getTickPrice
} from '@/application/concentrated/getNearistDataPoint'
import txCreateConcentrated from '@/application/concentrated/txCreateConcentrated'
import useConcentrated from '@/application/concentrated/useConcentrated'
import useConcentratedAmmSelector from '@/application/concentrated/useConcentratedAmmSelector'
import useConcentratedAmountCalculator from '@/application/concentrated/useConcentratedAmountCalculator'
import useConcentratedInitCoinFiller from '@/application/concentrated/useConcentratedInitCoinFiller'
import useConcentratedLiquidityUrlParser from '@/application/concentrated/useConcentratedLiquidityUrlParser'
import { routeBack, routeTo } from '@/application/routeTools'
import { decimalToFraction } from '@/application/txTools/decimal2Fraction'
import useWallet from '@/application/wallet/useWallet'
import Button, { ButtonHandle } from '@/components/Button'
import CoinAvatarPair from '@/components/CoinAvatarPair'
import CoinInputBox, { CoinInputBoxHandle } from '@/components/CoinInputBox'
import CyberpunkStyleCard from '@/components/CyberpunkStyleCard'
import Icon from '@/components/Icon'
import PageLayout from '@/components/PageLayout'
import Row from '@/components/Row'
import toPubString from '@/functions/format/toMintString'
import toPercentString from '@/functions/format/toPercentString'
import { toTokenAmount } from '@/functions/format/toTokenAmount'
import toUsdVolume from '@/functions/format/toUsdVolume'
import { isMintEqual } from '@/functions/judgers/areEqual'
import { inClient } from '@/functions/judgers/isSSR'
import { gt, isMeaningfulNumber } from '@/functions/numberish/compare'
import { div, sub } from '@/functions/numberish/operations'
import toBN from '@/functions/numberish/toBN'
import toFraction from '@/functions/numberish/toFraction'
import { toString } from '@/functions/numberish/toString'
import createContextStore from '@/functions/react/createContextStore'
import { useEvent } from '@/hooks/useEvent'
import usePrevious from '@/hooks/usePrevious'
import { useRecordedEffect } from '@/hooks/useRecordedEffect'
import { useSwapTwoElements } from '@/hooks/useSwapTwoElements'
import useToggle from '@/hooks/useToggle'
import { canTokenPairBeSelected, PairInfoTitle, RemainSOLAlert, toXYChartFormat } from '@/pageComponents/Concentrated'
import InputLocked from '@/pageComponents/Concentrated/InputLocked'
import { calculateRatio } from '@/pageComponents/Concentrated/util'
import TokenSelectorDialog from '@/pageComponents/dialogs/TokenSelectorDialog'

import AddLiquidityConfirmDialog from '../../pageComponents/Concentrated/AddLiquidityConfirmDialog'
import Chart from '../../pageComponents/ConcentratedRangeChart/Chart'
import { Range } from '../../pageComponents/ConcentratedRangeChart/chartUtil'

const { ContextProvider: ConcentratedUIContextProvider, useStore: useLiquidityContextStore } = createContextStore({
  hasAcceptedPriceChange: false,
  coinInputBox1ComponentRef: createRef<CoinInputBoxHandle>(),
  coinInputBox2ComponentRef: createRef<CoinInputBoxHandle>(),
  liquidityButtonComponentRef: createRef<ButtonHandle>()
})

export default function Concentrated() {
  return (
    <ConcentratedUIContextProvider>
      <ConcentratedEffects />
      <PageLayout mobileBarTitle="Concentrated" metaTitle="Concentrated - Raydium">
        <NavButtons />
        <ConcentratedCard />
        {/* <UserLiquidityExhibition /> */}
      </PageLayout>
    </ConcentratedUIContextProvider>
  )
}

function NavButtons() {
  return (
    <Row
      className={twMerge(
        '-mt-4 mobile:mt-0.5 mb-8 mobile:mb-2 sticky z-10 -top-4 mobile:top-0 mobile:-translate-y-2 mobile:bg-[#0f0b2f] mobile:hidden items-center justify-between'
      )}
    >
      <Button
        type="text"
        className="text-sm text-[#ABC4FF] opacity-50 px-0"
        prefix={<Icon heroIconName="chevron-left" size="sm" />}
        onClick={() => {
          if (inClient && window.history.length === 1) {
            // user jump directly into /farms/create page by clicking a link, we "goback" to /farms
            routeTo('/clmm/pools')
          } else {
            routeBack()
          }
        }}
      >
        Back to all pools
      </Button>
    </Row>
  )
}

function AsideNavButtons() {
  return (
    <Row
      className={twMerge(
        '-mt-4 mobile:mt-0.5 mb-8 mobile:mb-2 sticky z-10 -top-4 mobile:top-0 mobile:-translate-y-2 mobile:bg-[#0f0b2f] items-center justify-between'
      )}
    >
      <Button
        type="text"
        className="text-sm text-[#ABC4FF] px-0"
        prefix={<Icon heroIconName="chevron-left" />}
        onClick={() => {
          if (inClient && window.history.length === 1) {
            // user jump directly into /farms/create page by clicking a link, we "goback" to /farms
            routeTo('/clmm/pools')
          } else {
            routeBack()
          }
        }}
      ></Button>
    </Row>
  )
}

function ConcentratedEffects() {
  useConcentratedLiquidityUrlParser()
  useConcentratedAmmSelector()
  useConcentratedAmountCalculator()
  useConcentratedInitCoinFiller()
  return null
}

function ConcentratedCard() {
  const chartPoints = useConcentrated((s) => s.chartPoints)
  const connected = useWallet((s) => s.connected)
  const [isConfirmOn, { off: onConfirmClose, on: onConfirmOpen }] = useToggle(false)
  const isApprovePanelShown = useAppSettings((s) => s.isApprovePanelShown)
  const [isCoinSelectorOn, { on: turnOnCoinSelector, off: turnOffCoinSelector }] = useToggle()
  // it is for coin selector panel
  const [targetCoinNo, setTargetCoinNo] = useState<'1' | '2'>('1')
  const checkWalletHasEnoughBalance = useWallet((s) => s.checkWalletHasEnoughBalance)

  const coin1 = useConcentrated((s) => s.coin1)
  const coin1Amount = useConcentrated((s) => s.coin1Amount)
  const coin2 = useConcentrated((s) => s.coin2)
  const coin2Amount = useConcentrated((s) => s.coin2Amount)
  const focusSide = useConcentrated((s) => s.focusSide)
  const currentAmmPool = useConcentrated((s) => s.currentAmmPool)
  const hydratedAmmPools = useConcentrated((s) => s.hydratedAmmPools)
  const priceUpper = useConcentrated((s) => s.priceUpper)
  const priceLower = useConcentrated((s) => s.priceLower)

  const poolFocusKey = `${currentAmmPool?.idString}-${focusSide}`
  const prevPoolId = usePrevious<string | undefined>(poolFocusKey)
  const chartRef = useRef<{ getPosition: () => { min: number; max: number } }>()
  const tickRef = useRef<{ lower?: number; upper?: number }>({ lower: undefined, upper: undefined })
  const decimals = coin1 || coin2 ? Math.max(coin1?.decimals ?? 0, coin2?.decimals ?? 0) : 6
  const isCoin1Base = isMintEqual(currentAmmPool?.state.mintA.mint, coin1)
  const isFocus1 = focusSide === 'coin1'
  const isPairPoolDirectionEq = (isFocus1 && isCoin1Base) || (!isCoin1Base && !isFocus1)
  const points = useMemo(() => {
    const formatPoints = chartPoints ? toXYChartFormat(chartPoints) : undefined
    if (isPairPoolDirectionEq) return formatPoints
    return formatPoints ? formatPoints.map((p) => ({ x: 1 / p.x, y: p.y })).reverse() : undefined
  }, [chartPoints, isPairPoolDirectionEq])
  const tickDirection = useMemo(
    () => Math.pow(-1, isCoin1Base ? (isFocus1 ? 0 : 1) : isFocus1 ? 1 : 0),
    [isCoin1Base, isFocus1]
  )

  const { coinInputBox1ComponentRef, coinInputBox2ComponentRef, liquidityButtonComponentRef } =
    useLiquidityContextStore()

  const swapElementBox1 = useRef<HTMLDivElement>(null)
  const swapElementBox2 = useRef<HTMLDivElement>(null)
  const [, { toggleSwap: toggleUISwap }] = useSwapTwoElements(swapElementBox1, swapElementBox2)
  useRecordedEffect(
    ([prevFocusSide]) => {
      if (prevFocusSide && prevFocusSide !== focusSide) {
        toggleUISwap()
      }
    },
    [focusSide]
  )

  const currentPrice = currentAmmPool
    ? decimalToFraction(
        isPairPoolDirectionEq
          ? currentAmmPool.state.currentPrice
          : new Decimal(1).div(currentAmmPool.state.currentPrice)
      )
    : undefined

  const inputDisable =
    currentAmmPool && currentPrice && priceLower !== undefined && priceUpper !== undefined
      ? [
          toBN(priceUpper || 0, decimals).lt(toBN(currentPrice || 0, decimals)),
          toBN(priceLower || 0, decimals).gt(toBN(currentPrice || 0, decimals))
        ]
      : [false, false]

  if (!isFocus1) inputDisable.reverse()
  const [coin1InputDisabled, coin2InputDisabled] = inputDisable

  useEffect(() => {
    coin1InputDisabled && useConcentrated.setState({ coin1Amount: '0' })
    coin2InputDisabled && useConcentrated.setState({ coin2Amount: '0' })
  }, [coin1InputDisabled, coin2InputDisabled])

  useEffect(
    () => () =>
      useConcentrated.setState({
        focusSide: 'coin1',
        userCursorSide: 'coin1'
      }),
    []
  )

  const haveEnoughCoin1 =
    coin1 && checkWalletHasEnoughBalance(toTokenAmount(coin1, coin1Amount, { alreadyDecimaled: true }))
  const haveEnoughCoin2 =
    coin2 && checkWalletHasEnoughBalance(toTokenAmount(coin2, coin2Amount, { alreadyDecimaled: true }))

  const cardRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    useConcentrated.setState({
      scrollToInputBox: () => cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }, [cardRef])

  const boundaryData = useMemo(
    () =>
      getPriceBoundary({
        coin1,
        coin2,
        ammPool: currentAmmPool,
        reverse: !isPairPoolDirectionEq
      }),
    [coin1, coin2, currentAmmPool, isPairPoolDirectionEq]
  )

  useEffect(() => {
    if (poolFocusKey === prevPoolId || !boundaryData) return
    useConcentrated.setState(boundaryData)
    tickRef.current.lower = boundaryData.priceLowerTick
    tickRef.current.upper = boundaryData.priceUpperTick
  }, [boundaryData, poolFocusKey, prevPoolId])

  const [prices, setPrices] = useState<(string | undefined)[]>([])
  const updatePrice1 = useCallback((tokenP) => setPrices((p) => [tokenP?.toExact(), p[1]]), [])
  const updatePrice2 = useCallback((tokenP) => setPrices((p) => [p[0], tokenP?.toExact()]), [])
  const totalDeposit = prices.filter((p) => !!p).reduce((acc, cur) => acc.add(toFraction(cur!)), toFraction(0))

  const { ratio1, ratio2 } = calculateRatio({
    currentPrice,
    coin1InputDisabled,
    coin2InputDisabled,
    coin1Amount,
    coin2Amount
  })

  const handleAdjustMin = useEvent((pos: { min: number; max: number }): { price: number; tick: number } => {
    const originRes = { price: pos.min, tick: tickRef.current.lower! }
    if (!currentAmmPool) return originRes
    if (pos[Range.Min] >= pos[Range.Max]) {
      const targetCoin = isFocus1 ? coin1 : coin2
      const minTick = tickRef.current.upper! - currentAmmPool.state.tickSpacing * tickDirection
      const { price, tick } = getTickPrice({
        poolInfo: currentAmmPool.state,
        baseIn: isMintEqual(currentAmmPool.state.mintA.mint, targetCoin?.mint),
        tick: minTick
      })
      tickRef.current.lower = tick
      useConcentrated.setState({ priceLowerTick: tick, priceLower: price })
      return { price: Number(price.toFixed(decimals)), tick }
    }
    return originRes
  })

  const handlePosChange = useCallback(
    ({ side, userInput, ...pos }: { min: number; max: number; side?: Range; userInput?: boolean }) => {
      if (!currentAmmPool || !coin1 || !coin2 || !pos.min || !pos.max) return
      const res = calLowerUpper({
        ...pos,
        coin1,
        coin2,
        ammPool: currentAmmPool,
        reverse: !isFocus1
      })!
      const isMin = side === Range.Min
      const tickKey = isMin ? 'priceLowerTick' : 'priceUpperTick'
      if (userInput && side) {
        tickRef.current[isMin ? 'lower' : 'upper'] = res[tickKey]
        isMin && useConcentrated.setState({ priceLowerTick: res[tickKey], priceLower: res.priceLower })
        !isMin && useConcentrated.setState({ priceUpperTick: res[tickKey], priceUpper: res.priceUpper })
      } else {
        tickRef.current = { lower: res.priceLowerTick, upper: res.priceUpperTick }
        useConcentrated.setState(res)
      }
      return res
    },
    [toPubString(coin1?.mint), toPubString(coin2?.mint), currentAmmPool?.idString, isFocus1]
  )

  const handleClickInDecrease = useCallback(
    ({ p, isMin, isIncrease }: { p: number; isMin: boolean; isIncrease: boolean }) => {
      if (!currentAmmPool || !coin1 || !coin2) return
      const targetCoin = isFocus1 ? coin1 : coin2
      const tickKey = isMin ? 'lower' : 'upper'

      const nextTick =
        tickRef.current[tickKey]! +
        (isIncrease ? currentAmmPool.state.tickSpacing : -1 * currentAmmPool.state.tickSpacing) * tickDirection
      const { price } = getTickPrice({
        poolInfo: currentAmmPool.state,
        baseIn: isMintEqual(currentAmmPool.state.mintA.mint, targetCoin?.mint),
        tick: nextTick
      })
      if (isMin && Number(price.toFixed(decimals)) >= chartRef.current!.getPosition().max) return toFraction(p)

      tickRef.current[tickKey] = nextTick
      isMin && useConcentrated.setState({ priceLower: price, priceLowerTick: nextTick })
      !isMin && useConcentrated.setState({ priceUpper: price, priceUpperTick: nextTick })
      return price
    },
    [coin1?.mint, coin2?.mint, currentAmmPool?.idString, tickDirection, decimals]
  )

  const handleClickCreatePool = useCallback(() => {
    onConfirmOpen()
  }, [onConfirmOpen])

  const chartOptions = useMemo(
    () => ({
      points: points || [],
      initMinBoundaryX: boundaryData?.priceLower,
      initMaxBoundaryX: boundaryData?.priceUpper
    }),
    [points, boundaryData]
  )

  return (
    <CyberpunkStyleCard
      domRef={cardRef}
      wrapperClassName="w-[min(912px,100%)] w-full self-center cyberpunk-bg-light"
      className="p-6 mobile:py-5 mobile:px-3"
    >
      <div className="absolute -left-8 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <AsideNavButtons />
      </div>

      <PairInfoTitle
        coin1={coin1}
        coin2={coin2}
        fee={toPercentString(currentAmmPool?.tradeFeeRate, { exact: true })}
        focusSide={focusSide}
        onChangeFocus={(focusSide) => useConcentrated.setState({ focusSide })}
      />

      <div className="flex flex-col sm:flex-row flex-gap-1 gap-3 mb-3">
        <div className="bg-dark-blue rounded-xl flex flex-col justify-between w-full sm:w-1/2 px-3 py-4">
          <div>
            <div className="text-base leading-[22px] text-secondary-title mb-5">Deposit Amount</div>

            {/* input twin */}
            <div ref={swapElementBox1} className="relative">
              {coin1InputDisabled && <InputLocked />}
              <CoinInputBox
                className="mt-5 mb-4 mobile:mt-0 py-2 mobile:py-1 px-3 mobile:px-2 border-1.5 border-[#abc4ff40]"
                disabled={isApprovePanelShown}
                disabledInput={!currentAmmPool || coin1InputDisabled}
                noDisableStyle
                componentRef={coinInputBox1ComponentRef}
                value={currentAmmPool ? toString(coin1Amount) : undefined}
                haveHalfButton
                haveCoinIcon
                showTokenSelectIcon
                topLeftLabel=""
                onPriceChange={updatePrice1}
                onTryToTokenSelect={() => {
                  turnOnCoinSelector()
                  setTargetCoinNo('1')
                }}
                onUserInput={(amount) => {
                  useConcentrated.setState({ coin1Amount: amount, userCursorSide: 'coin1' })
                }}
                onEnter={(input) => {
                  if (!input) return
                  if (!coin2) coinInputBox2ComponentRef.current?.selectToken?.()
                  if (coin2 && coin2Amount) liquidityButtonComponentRef.current?.click?.()
                }}
                token={coin1}
              />
            </div>
            <div ref={swapElementBox2} className="relative">
              {coin2InputDisabled && <InputLocked />}
              <CoinInputBox
                className="py-2 mobile:py-1 px-3 mobile:px-2 border-1.5 border-[#abc4ff40]"
                componentRef={coinInputBox2ComponentRef}
                disabled={isApprovePanelShown}
                disabledInput={!currentAmmPool || coin2InputDisabled}
                noDisableStyle
                value={currentAmmPool ? toString(coin2Amount) : undefined}
                haveHalfButton
                haveCoinIcon
                showTokenSelectIcon
                topLeftLabel=""
                onPriceChange={updatePrice2}
                onTryToTokenSelect={() => {
                  turnOnCoinSelector()
                  setTargetCoinNo('2')
                }}
                onEnter={(input) => {
                  if (!input) return
                  if (!coin1) coinInputBox1ComponentRef.current?.selectToken?.()
                  if (coin1 && coin1Amount) liquidityButtonComponentRef.current?.click?.()
                }}
                onUserInput={(amount) => {
                  useConcentrated.setState({ coin2Amount: amount, userCursorSide: 'coin2' })
                }}
                token={coin2}
              />
            </div>

            <div className="mt-4 border-1.5 border-secondary-title border-opacity-50  rounded-xl px-3 py-4">
              <div className="flex justify-between mb-4">
                <span className="text-sm leading-[18px] text-secondary-title">Total Deposit</span>
                <span className="text-lg leading-[18px]">
                  {Boolean(currentAmmPool) && (isMeaningfulNumber(coin1Amount) || isMeaningfulNumber(coin2Amount))
                    ? toUsdVolume(totalDeposit)
                    : '--'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm leading-[20px] text-secondary-title">Deposit Ratio</span>
                <span className="text-base leading-[20px] flex items-center">
                  {currentAmmPool && <CoinAvatarPair className="mr-1" size="sm" token1={coin1} token2={coin2} />}
                  {Boolean(currentAmmPool) && (isMeaningfulNumber(coin1Amount) || isMeaningfulNumber(coin2Amount))
                    ? `${ratio1}% / ${ratio2}%`
                    : '--'}
                </span>
              </div>
            </div>
          </div>

          {/* supply button */}
          <Button
            className="frosted-glass-teal w-full mt-[26.1px]"
            componentRef={liquidityButtonComponentRef}
            isLoading={isApprovePanelShown}
            validators={[
              {
                should: connected,
                forceActive: true,
                fallbackProps: {
                  onClick: () => useAppSettings.setState({ isWalletSelectorShown: true }),
                  children: 'Connect Wallet'
                }
              },
              {
                should: currentAmmPool,
                fallbackProps: {
                  children: 'Pool Not Found'
                }
              },
              {
                should: gt(sub(priceUpper, priceLower), div(currentAmmPool?.currentPrice, 1000)),
                fallbackProps: {
                  children: 'Range to small'
                }
              },
              {
                should: coin1 && coin2,
                fallbackProps: { children: 'Select a token' }
              },
              {
                should: isMeaningfulNumber(coin1Amount) || isMeaningfulNumber(coin2Amount),
                fallbackProps: { children: 'Enter an amount' }
              },
              {
                should: haveEnoughCoin1,
                fallbackProps: { children: `Insufficient ${coin1?.symbol ?? ''} balance` }
              },
              {
                should: haveEnoughCoin2,
                fallbackProps: { children: `Insufficient ${coin2?.symbol ?? ''} balance` }
              }
            ]}
            onClick={() => {
              handleClickCreatePool()
            }}
          >
            Preview
          </Button>
          <RemainSOLAlert />
        </div>

        <div
          className={`relative bg-dark-blue min-h-[180px] rounded-xl w-full sm:w-1/2 px-3 py-4 ${
            currentAmmPool ? '' : 'pointer-events-none select-none'
          }`}
        >
          {!currentAmmPool && (
            <div className="absolute inset-0 z-10 grid grid-child-center backdrop-blur-md text-[#abc4ff]">
              {hydratedAmmPools.length ? 'Pool Not Found' : 'Loading...'}
            </div>
          )}
          <Chart
            poolFocusKey={poolFocusKey}
            title={<div className="text-base leading-[22px] text-secondary-title mb-3">Set Price Range</div>}
            ref={chartRef}
            chartOptions={chartOptions}
            currentPrice={currentPrice}
            priceLabel={isFocus1 ? `${coin2?.symbol} per ${coin1?.symbol}` : `${coin1?.symbol} per ${coin2?.symbol}`}
            decimals={decimals}
            onPositionChange={handlePosChange}
            onInDecrease={handleClickInDecrease}
            onAdjustMin={handleAdjustMin}
            showZoom
            height={200}
            coin1InputDisabled={coin1InputDisabled}
            coin2InputDisabled={coin2InputDisabled}
          />
        </div>
      </div>
      {/** coin selector panel */}
      <TokenSelectorDialog
        open={isCoinSelectorOn}
        onClose={turnOffCoinSelector}
        onSelectToken={(token) => {
          if (targetCoinNo === '1') {
            useConcentrated.setState({ coin1: token })
            // delete other
            if (!canTokenPairBeSelected(token, coin2)) {
              useConcentrated.setState({ coin2: undefined, coin2Amount: undefined, priceLowerTick: undefined })
            }
          } else {
            // delete other
            useConcentrated.setState({ coin2: token })
            if (!canTokenPairBeSelected(token, coin1)) {
              useConcentrated.setState({ coin1: undefined, coin1Amount: undefined, priceUpperTick: undefined })
            }
          }
          turnOffCoinSelector()
        }}
      />
      <AddLiquidityConfirmDialog
        open={isConfirmOn}
        coin1={coin1}
        coin2={coin2}
        coin1Amount={coin1Amount}
        coin2Amount={coin2Amount}
        decimals={decimals}
        position={chartRef.current?.getPosition()}
        totalDeposit={toUsdVolume(totalDeposit)}
        currentPrice={
          currentAmmPool
            ? decimalToFraction(
                isCoin1Base ? currentAmmPool.state.currentPrice : new Decimal(1).div(currentAmmPool.state.currentPrice)
              )
            : undefined
        }
        onConfirm={(close) =>
          txCreateConcentrated().then(({ allSuccess }) => {
            if (allSuccess) close()
          })
        }
        onClose={onConfirmClose}
      />
    </CyberpunkStyleCard>
  )
}
