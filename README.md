# LN Sync

Methods for synchronizing metadata about Lightning Network nodes, channels, and 
payments.

## Methods

### `acceptsChannelOpen`

Confirm that a peer will accept a channel open

    {
      capacity: <Channel Capacity Tokens Number>
      [cooperative_close_address]: <Restrict Coop Close To Address String>
      [give_tokens]: <Tokens to Gift To Partner Number> // Defaults to zero
      [is_private]: <Channel is Private Bool> // Defaults to false
      lnd: <Authenticated LND API Object>
      [min_htlc_mtokens]: <Minimum HTLC Millitokens String>
      [partner_csv_delay]: <Peer Output CSV Delay Number>
      partner_public_key: <Public Key Hex String>
    }

    @returns via cbk or Promise
    {
      is_accepted: <Channel Proposal Is Accepted Bool>
    }

### `askForFeeRate`

Ask to get a chain fee rate

    {
      ask: <Inquirer Ask Function>
      lnd: <Authenticated LND API Object>
    }

    @returns via cbk or Promise
    {
      tokens_per_vbyte: <Chain Fee Tokens Per VByte Number>
    }

### `broadcastTransaction`

Broadcast a chain transaction until it gets confirmed in a block

    {
      [description]: <Transaction Description String>
      lnd: <Authenticated LND API Object>
      logger: <Winston Logger Object>
      transaction: <Transaction String>
    }

    @returns via cbk or Promise
    {
      transaction_confirmed_in_block: <Block Height Number>
    }

### `connectPeer`

Connect a peer

    {
      id: <Node Public Key Hex String>
      lnd: <Authenticated LND API Object>
    }

    @returns via cbk or Promise

### `findKey`

Find a public key given a query

    {
      [channels]: [{
        partner_public_key: <Partner Public Key Hex String>
      }]
      lnd: <Authenticated LND API Object>
      [query]: <Query String>
    }

    @returns via cbk or Promise
    {
      [public_key]: <Public Key Hex String>
    }

### `formatTokens`

Format tokens for display

    {
      is_monochrome: <Avoid Applying Colors Bool>
      tokens: <Tokens Number>
    }

    @returns
    {
      display: <Display Formatted Tokens String>
    }

### `getAllInvoices`

Get all invoices

    {
      [confirmed_after]: <Confirmed At or After ISO 8601 Date String>
      [created_after]: <Confirmed At or After ISO 8601 Date String>
      lnd: <Authenticated LND API Object>
    }

    @returns via cbk or Promise
    {
      invoices: [{
        [chain_address]: <Fallback Chain Address String>
        cltv_delta: <Final CLTV Delta Number>
        [confirmed_at]: <Settled at ISO 8601 Date String>
        created_at: <ISO 8601 Date String>
        description: <Description String>
        [description_hash]: <Description Hash Hex String>
        expires_at: <ISO 8601 Date String>
        features: [{
          bit: <BOLT 09 Feature Bit Number>
          is_known: <Feature is Known Bool>
          is_required: <Feature Support is Required To Pay Bool>
          type: <Feature Type String>
        }]
        id: <Payment Hash String>
        [is_canceled]: <Invoice is Canceled Bool>
        is_confirmed: <Invoice is Confirmed Bool>
        [is_held]: <HTLC is Held Bool>
        is_private: <Invoice is Private Bool>
        [is_push]: <Invoice is Push Payment Bool>
        payments: [{
          [confirmed_at]: <Payment Settled At ISO 8601 Date String>
          created_at: <Payment Held Since ISO 860 Date String>
          created_height: <Payment Held Since Block Height Number>
          in_channel: <Incoming Payment Through Channel Id String>
          is_canceled: <Payment is Canceled Bool>
          is_confirmed: <Payment is Confirmed Bool>
          is_held: <Payment is Held Bool>
          messages: [{
            type: <Message Type Number String>
            value: <Raw Value Hex String>
          }]
          mtokens: <Incoming Payment Millitokens String>
          [pending_index]: <Pending Payment Channel HTLC Index Number>
          tokens: <Payment Tokens Number>
          [total_mtokens]: <Total Millitokens String>
        }]
        received: <Received Tokens Number>
        received_mtokens: <Received Millitokens String>
        [request]: <Bolt 11 Invoice String>
        secret: <Secret Preimage Hex String>
        tokens: <Tokens Number>
      }]
    }

### `getFundedTransaction`

Get a funded transaction

    {
      ask: <Inquirer Ask Function>
      [chain_fee_tokens_per_vbyte]: <Internal Funding Uses Tokens/Vbyte Number>
      [is_external]: <Transaction Uses External Funds Bool>
      lnd: Authenticated LND API Object>
      logger: <Winston Logger Object>
      outputs: [{
        address: <Chain Address String>
        tokens: <Tokens To Send To Output Number>
      }]
    }

    @returns via cbk or Promise
    {
      id: <Transaction Id Hex String>
      [inputs]: [{
        [lock_expires_at]: <UTXO Lock Expires At ISO 8601 Date String>
        [lock_id]: <UTXO Lock Id Hex String>
        transaction_id: <Transaction Hex Id String>
        transaction_vout: <Transaction Output Index Number>
      }]
      [psbt]: <Transaction As Finalized PSBT Hex String>
      transaction: <Raw Transaction Hex String>
    }

### `getLiquidity`

Get the channel available liquidity

A request function is required when min_node_score is specified

    {
      [is_outbound]: <Return Outbound Liquidity Bool>
      [is_top]: <Return Top Liquidity Bool>
      lnd: <Authenticated LND API Object>
      [min_node_score]: <Minimum Node Score Number>
      [max_fee_rate]: <Max Inbound Fee Rate Parts Per Million Number>
      [request]: <Request Function>
      [with]: [<Liquidity With Specific Node Public Key Hex String>]
    }

    @returns via cbk
    {
      tokens: [<Liquidity Tokens Number>]
    }

### `getNetwork`

Get network name for lnd

    {
      lnd: <Authenticated LND API Object>
    }

    @returns via cbk or Promise
    {
      [bitcoinjs]: <Bitcoin JS Network Name String>
      network: <Network Name String>
    }

### `getNodeAlias`

Get the alias of a node, ignoring errors

    {
      id: <Node Identity Public Key Hex String>
      lnd: <Authenticated LND API Object>
    }

    @returns via cbk or Promise
    {
      alias: <Node Alias String>
      id: <Node Identity Public Key Hex String>
    }

### `getMaxFundAmount`

Find the max amount that can be used for funding outputs given inputs

    {
      addresses: [<Send to Address String>]
      fee_tokens_per_vbyte: <Funding Fee Tokens Per VByte Number>
      inputs: [{
        tokens: <Input Tokens Number>
        transaction_id: <UTXO Transaction Id Hex String>
        transaction_vout: <UTXO Transaction Output Index Number>
      }]
      lnd: <Authenticated LND API Object>
    }

    @returns via cbk or Promise
    {
      fee_tokens_per_vbyte: <Effective Final Fee Tokens Per VByte Number>
      max_tokens: <Maximum Spendable Tokens Number>
    }

### `getPayments`

Get payments

    {
      [after]: <Get Only Payments Create At Or After ISO 8601 Date String>
      lnd: <Authenticated LND API Object>
    }

    @returns via cbk or Promise
    {
      payments: [{
        attempts: [{
          [failure]: {
            code: <Error Type Code Number>
            [details]: {
              [channel]: <Standard Format Channel Id String>
              [height]: <Error Associated Block Height Number>
              [index]: <Failed Hop Index Number>
              [mtokens]: <Error Millitokens String>
              [policy]: {
                base_fee_mtokens: <Base Fee Millitokens String>
                cltv_delta: <Locktime Delta Number>
                fee_rate: <Fees Charged in Millitokens Per Million Number>
                [is_disabled]: <Channel is Disabled Bool>
                max_htlc_mtokens: <Maximum HLTC Millitokens Value String>
                min_htlc_mtokens: <Minimum HTLC Millitokens Value String>
                updated_at: <Updated At ISO 8601 Date String>
              }
              [timeout_height]: <Error CLTV Timeout Height Number>
              [update]: {
                chain: <Chain Id Hex String>
                channel_flags: <Channel Flags Number>
                extra_opaque_data: <Extra Opaque Data Hex String>
                message_flags: <Message Flags Number>
                signature: <Channel Update Signature Hex String>
              }
            }
            message: <Error Message String>
          }
          [index]: <Payment Add Index Number>
          is_confirmed: <Payment Attempt Succeeded Bool>
          is_failed: <Payment Attempt Failed Bool>
          is_pending: <Payment Attempt is Waiting For Resolution Bool>
          route: {
            fee: <Route Fee Tokens Number>
            fee_mtokens: <Route Fee Millitokens String>
            hops: [{
              channel: <Standard Format Channel Id String>
              channel_capacity: <Channel Capacity Tokens Number>
              fee: <Fee Number>
              fee_mtokens: <Fee Millitokens String>
              forward: <Forward Tokens Number>
              forward_mtokens: <Forward Millitokens String>
              [public_key]: <Forward Edge Public Key Hex String>
              [timeout]: <Timeout Block Height Number>
            }]
            mtokens: <Total Fee-Inclusive Millitokens String>
            [payment]: <Payment Identifier Hex String>
            timeout: <Timeout Block Height Number>
            tokens: <Total Fee-Inclusive Tokens Number>
            [total_mtokens]: <Total Millitokens String>
          }
        }]
        created_at: <Payment at ISO-8601 Date String>
        destination: <Destination Node Public Key Hex String>
        fee: <Paid Routing Fee Rounded Down Tokens Number>
        fee_mtokens: <Paid Routing Fee in Millitokens String>
        hops: [<First Route Hop Public Key Hex String>]
        id: <Payment Preimage Hash String>
        [index]: <Payment Add Index Number>
        is_confirmed: <Payment is Confirmed Bool>
        is_outgoing: <Transaction Is Outgoing Bool>
        mtokens: <Millitokens Sent to Destination String>
        [request]: <BOLT 11 Payment Request String>
        safe_fee: <Payment Forwarding Fee Rounded Up Tokens Number>
        safe_tokens: <Payment Tokens Rounded Up Number>
        secret: <Payment Preimage Hex String>
        tokens: <Rounded Down Tokens Sent to Destination Number>
      }]
    }

### `getPeerLiquidity`

Get the rundown on liquidity with a specific peer

    {
      lnd: <Authenticated LND API Object>
      public_key: <Peer Public Key Hex String>
      [settled]: <Known Settled Payment Id String>
    }

    @returns via cbk or Promise
    {
      alias: <Alias String>
      inbound: <Inbound Liquidity Tokens Number>
      inbound_pending: <Pending Inbound Liquidity Tokens Number>
      outbound: <Outbound Liquidity Tokens Number>
      outbound_pending: <Pending Outbound Liquidity Tokens Number>
    }

### `getRebalancePayments`

Get payments that were rebalances

    {
      after: <Rebalance Payments After ISO 8601 Date String>
      lnds: [<Authenticated LND API Object>]
    }

    @returns via cbk or Promise
    {
      payments: [{
        attempts: [{
          [failure]: {
            code: <Error Type Code Number>
            [details]: {
              [channel]: <Standard Format Channel Id String>
              [height]: <Error Associated Block Height Number>
              [index]: <Failed Hop Index Number>
              [mtokens]: <Error Millitokens String>
              [policy]: {
                base_fee_mtokens: <Base Fee Millitokens String>
                cltv_delta: <Locktime Delta Number>
                fee_rate: <Fees Charged in Millitokens Per Million Number>
                [is_disabled]: <Channel is Disabled Bool>
                max_htlc_mtokens: <Maximum HLTC Millitokens Value String>
                min_htlc_mtokens: <Minimum HTLC Millitokens Value String>
                updated_at: <Updated At ISO 8601 Date String>
              }
              [timeout_height]: <Error CLTV Timeout Height Number>
              [update]: {
                chain: <Chain Id Hex String>
                channel_flags: <Channel Flags Number>
                extra_opaque_data: <Extra Opaque Data Hex String>
                message_flags: <Message Flags Number>
                signature: <Channel Update Signature Hex String>
              }
            }
            message: <Error Message String>
          }
          [index]: <Payment Add Index Number>
          [confirmed_at]: <Payment Confirmed At ISO 8601 Date String>
          is_confirmed: <Payment Attempt Succeeded Bool>
          is_failed: <Payment Attempt Failed Bool>
          is_pending: <Payment Attempt is Waiting For Resolution Bool>
          route: {
            fee: <Route Fee Tokens Number>
            fee_mtokens: <Route Fee Millitokens String>
            hops: [{
              channel: <Standard Format Channel Id String>
              channel_capacity: <Channel Capacity Tokens Number>
              fee: <Fee Number>
              fee_mtokens: <Fee Millitokens String>
              forward: <Forward Tokens Number>
              forward_mtokens: <Forward Millitokens String>
              [public_key]: <Forward Edge Public Key Hex String>
              [timeout]: <Timeout Block Height Number>
            }]
            mtokens: <Total Fee-Inclusive Millitokens String>
            [payment]: <Payment Identifier Hex String>
            timeout: <Timeout Block Height Number>
            tokens: <Total Fee-Inclusive Tokens Number>
            [total_mtokens]: <Total Millitokens String>
          }
        }]
        confirmed_at: <Payment Confirmed At ISO 8601 Date String>
        created_at: <Payment at ISO-8601 Date String>
        destination: <Destination Node Public Key Hex String>
        fee: <Paid Routing Fee Rounded Down Tokens Number>
        fee_mtokens: <Paid Routing Fee in Millitokens String>
        hops: [<First Route Hop Public Key Hex String>]
        id: <Payment Preimage Hash String>
        [index]: <Payment Add Index Number>
        is_confirmed: <Payment is Confirmed Bool>
        is_outgoing: <Transaction Is Outgoing Bool>
        mtokens: <Millitokens Sent to Destination String>
        [request]: <BOLT 11 Payment Request String>
        safe_fee: <Payment Forwarding Fee Rounded Up Tokens Number>
        safe_tokens: <Payment Tokens Rounded Up Number>
        secret: <Payment Preimage Hex String>
        tokens: <Rounded Down Tokens Sent to Destination Number>
      }]
    }

### `getScoredNodes`

Get scored nodes

    {
      network: <Network Name String>
      request: <Request Function>
    }

    @returns via cbk or Promise
    {
      nodes: [{
        public_key: <Public Key Hex String>
        score: <Forwarding Quality Score Out Of One Hundred Million Number>
      }]
    }

### `getTransactionRecord`

Get LND internal record associated with a transaction id

    {
      [chain_transactions]: [{
        [block_id]: <Block Hash String>
        [confirmation_count]: <Confirmation Count Number>
        [confirmation_height]: <Confirmation Block Height Number>
        created_at: <Created ISO 8601 Date String>
        [description]: <Transaction Label String>
        [fee]: <Fees Paid Tokens Number>
        id: <Transaction Id String>
        is_confirmed: <Is Confirmed Bool>
        is_outgoing: <Transaction Outbound Bool>
        output_addresses: [<Address String>]
        tokens: <Tokens Including Fee Number>
        [transaction]: <Raw Transaction Hex String>
      }]
      [channels]: [{
        capacity: <Capacity Tokens Numberr>
        id: <Standard Format Short Channel Id Hex String>
        partner_public_key: <Peer Public Key Hex String>
        transaction_id: <Channel Transaction Id Hex String>
      }]
      [closed_channels]: [{
        capacity: <Closed Channel Capacity Tokens Number>
        [close_balance_spent_by]: <Channel Balance Output Spent By Tx Id String>
        [close_balance_vout]: <Channel Balance Close Tx Output Index Number>
        [close_confirm_height]: <Channel Close Confirmation Height Number>
        close_payments: [{
          is_outgoing: <Payment Is Outgoing Bool>
          is_paid: <Payment Is Claimed With Preimage Bool>
          is_pending: <Payment Resolution Is Pending Bool>
          is_refunded: <Payment Timed Out And Went Back To Payer Bool>
          [spent_by]: <Close Transaction Spent By Transaction Id Hex String>
          tokens: <Associated Tokens Number>
          transaction_id: <Transaction Id Hex String>
          transaction_vout: <Transaction Output Index Number>
        }]
        [close_transaction_id]: <Closing Transaction Id Hex String>
        final_local_balance: <Channel Close Final Local Balance Tokens Number>
        final_time_locked_balance: <Closed Channel Timelocked Tokens Number>
        [id]: <Closed Standard Format Channel Id String>
        is_breach_close: <Is Breach Close Bool>
        is_cooperative_close: <Is Cooperative Close Bool>
        is_funding_cancel: <Is Funding Cancelled Close Bool>
        is_local_force_close: <Is Local Force Close Bool>
        [is_partner_closed]: <Channel Was Closed By Channel Peer Bool>
        [is_partner_initiated]: <Channel Was Initiated By Channel Peer Bool>
        is_remote_force_close: <Is Remote Force Close Bool>
        partner_public_key: <Partner Public Key Hex String>
        transaction_id: <Channel Funding Transaction Id Hex String>
        transaction_vout: <Channel Funding Output Index Number>
      }]
      id: <Transaction Id Hex String>
      lnd: <Authenticated LND API Object>
      [pending_channels]: [{
        [close_transaction_id]: <Channel Closing Transaction Id String>
        is_active: <Channel Is Active Bool>
        is_closing: <Channel Is Closing Bool>
        is_opening: <Channel Is Opening Bool>
        is_partner_initiated: <Channel Partner Initiated Channel Bool>
        local_balance: <Channel Local Tokens Balance Number>
        local_reserve: <Channel Local Reserved Tokens Number>
        partner_public_key: <Channel Peer Public Key String>
        [pending_balance]: <Tokens Pending Recovery Number>
        [pending_payments]: [{
          is_incoming: <Payment Is Incoming Bool>
          timelock_height: <Payment Timelocked Until Height Number>
          tokens: <Payment Tokens Number>
          transaction_id: <Payment Transaction Id String>
          transaction_vout: <Payment Transaction Vout Number>
        }]
        received: <Tokens Received Number>
        [recovered_tokens]: <Tokens Recovered From Close Number>
        remote_balance: <Remote Tokens Balance Number>
        remote_reserve: <Channel Remote Reserved Tokens Number>
        sent: <Send Tokens Number>
        [timelock_expiration]: <Pending Tokens Block Height Timelock Number>
        [transaction_fee]: <Funding Transaction Fee Tokens Number>
        transaction_id: <Channel Funding Transaction Id String>
        transaction_vout: <Channel Funding Transaction Vout Number>
        [transaction_weight]: <Funding Transaction Weight Number>
      }]
    }

    @returns via cbk or Promise
    {
      [chain_fee]: <Paid Transaction Fee Tokens Number>
      [received]: <Received Tokens Number>
      related_channels: [{
        action: <Channel Action String>
        [balance]: <Channel Balance Tokens Number>
        [capacity]: <Channel Capacity Value Number>
        [channel]: <Channel Standard Format Id String>
        [close_tx]: <Channel Closing Transaction Id Hex String>
        [open_tx]: <Channel Opening Transaction id Hex String>
        [timelock]: <Channel Funds Timelocked Until Height Number>
        with: <Channel Peer Public Key Hex String>
      }]
      [sent]: <Sent Tokens Number>
      [sent_to]: [<Sent to Address String>]
      [tx]: <Transaction Id Hex String>
    }

### `getTransitRefund`

Make a refund transaction for transit funds

    {
      funded_tokens: <Tokens Sent to Transit Address Number>
      lnd: <Authenticated LND API Object>
      network: <Network Name String>
      refund_address: <Refund Coins to On Chain Address String>
      transit_address: <Transit On Chain Bech32 Address String>
      transit_key_index: <Transit Key Index Number>
      transit_public_key: <Transit Public Key Hex String>
      transaction_id: <Transaction Id Hex String>
      transaction_vout: <Transaction Output Index Number>
    }

    @returns via cbk or Promise
    {
      refund: <Fully Signed Refund Transaction Hex String>
    }

### `updateChannelFee`

Update the fee for an individual channel

    {
      [base_fee_mtokens]: <Base Fee Millitokens String>
      [cltv_delta]: <CLTV Delta to Use Number>
      fee_rate: <Fee Rate Number>
      from: <Local Node Public Key Hex String>
      lnd: <Authenticated LND API Object>
      [max_htlc_mtokens]: <Maximum HTLC Millitokens to Forward String>
      [min_htlc_mtokens]: <Minimum HTLC Millitokens to Forward String>
      transaction_id: <Funding Transaction Id Hex String>
      transaction_vout: <Funding Transaction Output Index Number>
    }

    @returns via cbk or Promise

### `waitForPendingOpen`

Wait for an incoming pending open channel matching specific criteria

    {
      [capacity]: <Channel Capacity Tokens Number>
      interval: <Check Time Milliseconds Number>
      lnd: <Authenticated LND API Object>
      local_balance: <Starting Local Balance Number>
      partner_public_key: <Peer Public Key Hex String>
      times: <Total Check Times Number>
      transaction_id: <Transaction Id Hex String>
      transaction_vout: <Transaction Output Index Number>
    }

    @returns via cbk or Promise
    {
      transaction_id: <Transaction Id Hex String>
      transaction_vout: <Transaction Output Index Number>
    }
